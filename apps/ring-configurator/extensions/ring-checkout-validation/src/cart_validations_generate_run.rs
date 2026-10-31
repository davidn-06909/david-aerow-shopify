use crate::schema;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::{BTreeMap, HashSet};

const ERROR: &str = "This ring configuration changed. Return to the ring builder and add it again.";

#[derive(Deserialize)]
struct Config {
    version: u8,
    keys: Vec<Key>,
    products: Vec<String>,
    variants: Vec<String>,
}

#[derive(Deserialize)]
struct Key {
    id: String,
    public_key: String,
}

#[derive(Deserialize)]
struct Ticket {
    v: u8,
    k: String,
    g: String,
    d: String,
    r: String,
    setting: String,
    diamond: String,
    engraving_variant: Option<String>,
    engraving: Option<String>,
}

struct Line {
    variant: String,
    product: String,
    quantity: i32,
    group: Option<String>,
    role: Option<String>,
    ticket: Option<String>,
    design: Option<String>,
    reference: Option<String>,
    engraving: Option<String>,
}

fn valid_ticket(text: &str, config: &Config) -> Option<Ticket> {
    if text.len() > 2048 { return None; }
    let (body, sig) = text.split_once('.')?;
    let bytes = URL_SAFE_NO_PAD.decode(body).ok()?;
    let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(sig).ok()?).ok()?;
    let ticket: Ticket = serde_json::from_slice(&bytes).ok()?;
    if ticket.v != 1 || ticket.g.len() != 36 || ticket.d.len() != 36 || ticket.r.len() > 512 { return None; }
    let key = config.keys.iter().find(|k| k.id == ticket.k)?;
    let key_bytes: [u8; 32] = URL_SAFE_NO_PAD.decode(&key.public_key).ok()?.try_into().ok()?;
    let public_key = VerifyingKey::from_bytes(&key_bytes).ok()?;
    public_key.verify_strict(&bytes, &signature).ok()?;
    Some(ticket)
}

fn valid_group(lines: &[&Line], config: &Config) -> bool {
    if lines.len() < 2 || lines.len() > 3 { return false; }
    let Some(token) = lines[0].ticket.as_deref() else { return false; };
    let Some(ticket) = valid_ticket(token, config) else { return false; };
    if ticket.engraving_variant.is_some() != ticket.engraving.is_some() || ticket.engraving.as_ref().is_some_and(|e| e.chars().count() > 20) { return false; }
    if lines.len() != if ticket.engraving_variant.is_some() { 3 } else { 2 } { return false; }
    let mut seen = HashSet::new();
    for line in lines {
        if line.quantity != 1 || line.group.as_deref() != Some(ticket.g.as_str()) || line.ticket.as_deref() != Some(token)
            || line.design.as_deref() != Some(ticket.d.as_str()) || line.reference.as_deref() != Some(ticket.r.as_str()) { return false; }
        let Some(role) = line.role.as_deref() else { return false; };
        if !seen.insert(role) { return false; }
        let expected = match role {
            "setting" => &ticket.setting,
            "diamond" => &ticket.diamond,
            "engraving" => match ticket.engraving_variant.as_ref() { Some(v) => v, None => return false },
            _ => return false,
        };
        if &line.variant != expected { return false; }
        if role == "engraving" || role == "setting" {
            if line.engraving.as_ref() != ticket.engraving.as_ref() { return false; }
        }
        if role == "diamond" && line.engraving.is_some() { return false; }
    }
    seen.contains("setting") && seen.contains("diamond") && (ticket.engraving_variant.is_some() == seen.contains("engraving"))
}

#[shopify_function]
fn cart_validations_generate_run(input: schema::run::Input) -> Result<schema::CartValidationsGenerateRunResult> {
    if input.buyer_journey().step() == Some(&schema::BuyerJourneyStep::CartInteraction) {
        return Ok(schema::CartValidationsGenerateRunResult { operations: vec![] });
    }
    let config = input.validation().metafield().as_ref()
        .and_then(|field| serde_json::from_str::<Config>(field.value()).ok());
    let Some(config) = config else { return failed(); };
    if config.version != 1 || config.keys.is_empty() || config.keys.len() > 3 || config.products.len() + config.variants.len() > 1000 { return failed(); }
    let products: HashSet<&str> = config.products.iter().map(String::as_str).collect();
    let variants: HashSet<&str> = config.variants.iter().map(String::as_str).collect();
    let mut groups: BTreeMap<&str, Vec<&Line>> = BTreeMap::new();
    let mut parsed = Vec::with_capacity(input.cart().lines().len());
    for line in input.cart().lines() {
        let (variant, product) = match line.merchandise() {
            schema::run::input::cart::lines::Merchandise::ProductVariant(v) => (v.id().to_string(), v.product().id().to_string()),
            _ => (String::new(), String::new()),
        };
        parsed.push(Line { variant, product, quantity: *line.quantity(),
            group: line.group().as_ref().and_then(|a| a.value().clone()),
            role: line.role().as_ref().and_then(|a| a.value().clone()),
            ticket: line.ticket().as_ref().and_then(|a| a.value().clone()),
            design: line.design().as_ref().and_then(|a| a.value().clone()),
            reference: line.reference().as_ref().and_then(|a| a.value().clone()),
            engraving: line.engraving().as_ref().and_then(|a| a.value().clone()) });
    }
    for line in &parsed {
        let marked = line.group.is_some() || line.role.is_some() || line.ticket.is_some();
        let managed = products.contains(line.product.as_str()) || variants.contains(line.variant.as_str());
        if !marked && !managed { continue; }
        let Some(group) = line.group.as_deref() else { return failed(); };
        groups.entry(group).or_default().push(line);
    }
    if groups.len() > 32 || groups.values().any(|lines| !valid_group(lines, &config)) { return failed(); }
    Ok(schema::CartValidationsGenerateRunResult { operations: vec![] })
}

fn failed() -> Result<schema::CartValidationsGenerateRunResult> {
    Ok(schema::CartValidationsGenerateRunResult { operations: vec![schema::Operation::ValidationAdd(
        schema::ValidationAddOperation { errors: vec![schema::ValidationError { message: ERROR.to_string(), target: "$.cart".to_string() }] }
    )] })
}
