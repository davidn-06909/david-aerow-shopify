use shopify_function::prelude::*;
use std::process;

mod cart_validations_generate_run;

#[typegen("./schema.graphql")]
pub mod schema {
    #[query("src/cart_validations_generate_run.graphql")]
    pub mod run {}
}

fn main() {
    log!("Invoke the named cart validation export.");
    process::abort();
}
