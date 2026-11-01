import { useEffect, useState, type FormEvent } from 'react';
import { data, Form, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import prisma from '../db.server';
import { merchant } from '../services/merchant.server';
import { activeManifest } from '../services/catalog-state.server';
import { settingMappings } from '../services/manifest.server';
import { fittingManifestSchema, type FittingManifest, type FittingReport } from '../services/fitting';
import { initializeFitting, parseFittingManifest, publishFitting, saveFittingDraft, suspendFitting, validateFittingDraft } from '../services/fitting-state.server';
import { PilotError } from '../services/errors.server';
import { requestLimit } from '../services/limits.server';
import { METALS, SHAPES } from '../../shared/contract';
import '../styles/catalog.css';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await merchant(request);
  const state = await initializeFitting(session.shop);
  const catalog = await activeManifest(session.shop);
  const history = await prisma.fittingRelease.findMany({ where: { shop: session.shop }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, action: true, actor: true, createdAt: true } });
  return { shop: session.shop, state: { revision: state.revision, activeVersion: state.activeVersion },
    draft: parseFittingManifest(state.draft, session.shop),
    settings: settingMappings(catalog.manifest).filter(s => s.enabled).map(s => ({ id: s.id, title: s.title, assetVersion: s.assetVersion, metals: s.rules.metals, shapes: s.rules.shapes })),
    diamonds: catalog.manifest.diamonds.filter(d => d.enabled).map(d => ({ variantId: d.variantId, shape: d.shape, certificateLab: d.certificateLab, certificateNumber: d.certificateNumber })),
    history };
}

type ActionResult = { ok: boolean; message: string; report?: FittingReport; fields?: Record<string, string> };
export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, actor } = await merchant(request);
  try {
    if (request.method !== 'POST') throw new PilotError('METHOD_NOT_ALLOWED', 'Use POST for fitting changes.', 405);
    const text = await request.text();
    if (text.length > 200_000) throw new PilotError('PAYLOAD_TOO_LARGE', 'This fitting draft is too large.', 413);
    await requestLimit(session.shop, 'operator', 30);
    const form = new URLSearchParams(text), intent = form.get('intent');
    const revision = Number(form.get('revision'));
    if (!Number.isSafeInteger(revision) || revision < 1) throw new PilotError('FITTING_CONFLICT', 'Reload the fitting draft.', 409);
    if (intent === 'save') {
      let manifest: unknown;
      try { manifest = JSON.parse(form.get('manifest') || ''); } catch { throw new PilotError('INVALID_FITTING', 'The fitting draft could not be read.', 422); }
      await saveFittingDraft(session.shop, revision, manifest);
      return { ok: true, message: 'Fitting evidence saved as a draft. Customer purchasing is unchanged.' };
    }
    if (intent === 'validate') {
      const { report } = await validateFittingDraft(admin, session.shop, revision);
      return { ok: !report.errors.length, message: report.errors.length ? 'Resolve these evidence gaps before publication.' : 'Saved evidence matches the current catalog mappings.', report };
    }
    if (intent === 'publish') {
      const { version, report } = await publishFitting(admin, session.shop, revision, actor);
      return { ok: true, message: `Manufacturer fitting release ${version} published for exact approved combinations.`, report };
    }
    if (intent === 'suspend') {
      await suspendFitting(admin, session.shop, revision, actor);
      return { ok: true, message: 'Manufacturer fitting approval suspended. New fit-gated quotes are unavailable.' };
    }
    throw new PilotError('INVALID_ACTION', 'Choose a fitting action.', 400);
  } catch (error) {
    if (!(error instanceof PilotError)) return data({ ok: false, message: 'The fitting operation could not complete. Please retry.' }, { status: 503 });
    return data({ ok: false, message: error.message, fields: error.fields }, { status: error.status });
  }
}

const list = (value: string) => [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
const digestPattern = '[0-9a-fA-F]{64}';
type Assembly = FittingManifest['assemblies'][number];
type Stone = FittingManifest['stones'][number];
type Approval = FittingManifest['approvals'][number];

export default function FittingManager() {
  const d = useLoaderData<typeof loader>(), result = useActionData<typeof action>() as ActionResult | undefined, navigation = useNavigation();
  const [draft, setDraft] = useState(d.draft), [revision, setRevision] = useState(d.state.revision);
  const [error, setError] = useState('');
  const [assemblyInput, setAssemblyInput] = useState({ settingId: d.settings[0]?.id || '', shape: 'Round', headRevision: '', manufacturer: '', drawingDigest: '', evidenceReference: '', metals: METALS.join(', '), sizes: '' });
  const [stoneInput, setStoneInput] = useState({ variantId: d.diamonds[0]?.variantId || '', lengthMm: '', widthMm: '', depthMm: '', measurementDigest: '', evidenceReference: '' });
  const [approvalInput, setApprovalInput] = useState({ assemblyId: '', stoneVariantId: '', metals: '', sizes: '', approvedBy: '', approvedAt: '', evidenceDigest: '', evidenceReference: '' });
  useEffect(() => { if (result?.ok) { setDraft(d.draft); setRevision(d.state.revision); setError(''); } }, [d.state.revision, result]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(d.draft);
  const busy = navigation.state !== 'idle';
  const checked = result?.report;
  function addPart(event: FormEvent, key: 'assemblies' | 'stones' | 'approvals', value: Assembly | Stone | Approval) {
    event.preventDefault();
    const next = { ...draft, [key]: [...draft[key], value] };
    const parsed = fittingManifestSchema.safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Complete every evidence field.'); return; }
    setDraft(parsed.data);
    setError('');
  }
  const selectedSetting = d.settings.find(s => s.id === assemblyInput.settingId);
  const selectedStone = d.diamonds.find(s => s.variantId === stoneInput.variantId);
  const selectedAssembly = draft.assemblies.find(a => a.id === approvalInput.assemblyId);
  return <main className="rc-admin">
    <header><p className="rc-eyebrow">AEVOW · MANUFACTURER EVIDENCE</p><h1>Fitting approvals</h1><p>{d.shop} · Draft revision {revision} · {dirty ? 'Unsaved changes' : 'Saved draft'}</p></header>
    <section className="rc-card"><h2>Release status</h2><p>{d.state.activeVersion ? <>Active manufacturer fitting release <code>{d.state.activeVersion}</code></> : 'No manufacturer fitting release is active.'}</p>
      <p>Record actual head drawings and stone measurements before approval. A carat weight or the 3D preview does not establish physical fit. Evidence references must point to files kept in private, controlled storage; this page stores their SHA-256 digests, not the files.</p></section>
    {result && <aside role={result.ok ? 'status' : 'alert'} className={result.ok ? 'rc-success' : 'rc-error'}>{result.message}{checked && <><p>Checked {new Date(checked.checkedAt).toLocaleString()}</p>{checked.errors.length > 0 && <ul>{checked.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}{checked.warnings.length > 0 && <ul>{checked.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>}</>}{result.fields && <ul>{Object.entries(result.fields).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}</aside>}
    {error && <p role="alert" className="rc-error">{error}</p>}
    <section className="rc-card"><h2>1. Setting and head specifications</h2>
      <div className="rc-table-wrap"><table><thead><tr><th>Assembly</th><th>Coverage</th><th>Reviewed drawing</th><th /></tr></thead><tbody>{draft.assemblies.map(a => <tr key={a.id}><td>{a.settingId} / {a.shape}<small>{a.headRevision} · model {a.assetVersion}</small></td><td>{a.metals.join(', ')}<small>Sizes {a.sizes.join(', ')}</small></td><td>{a.manufacturer}<small>{a.evidenceReference} · SHA-256 {a.drawingDigest.slice(0, 12)}…</small></td><td><button type="button" onClick={() => setDraft(v => ({ ...v, approvals: v.approvals.filter(p => p.assemblyId !== a.id), assemblies: v.assemblies.filter(item => item.id !== a.id) }))}>Remove</button></td></tr>)}</tbody></table></div>
      <form onSubmit={e => { if (!selectedSetting) return; addPart(e, 'assemblies', { id: `assembly-${crypto.randomUUID().slice(0, 12)}`, settingId: assemblyInput.settingId, shape: assemblyInput.shape as Assembly['shape'], assetVersion: selectedSetting.assetVersion,
        headRevision: assemblyInput.headRevision, manufacturer: assemblyInput.manufacturer, drawingDigest: assemblyInput.drawingDigest.toLowerCase(), evidenceReference: assemblyInput.evidenceReference,
        metals: list(assemblyInput.metals) as Assembly['metals'], sizes: list(assemblyInput.sizes) }); }}><h3>Add a reviewed head specification</h3><div className="rc-grid">
        <label>Setting<select value={assemblyInput.settingId} onChange={e => setAssemblyInput(v => ({ ...v, settingId: e.target.value }))}>{d.settings.map(s => <option key={s.id} value={s.id}>{s.title} · {s.assetVersion}</option>)}</select></label>
        <label>Shape<select value={assemblyInput.shape} onChange={e => setAssemblyInput(v => ({ ...v, shape: e.target.value }))}>{SHAPES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Manufacturer head revision<input required maxLength={100} value={assemblyInput.headRevision} onChange={e => setAssemblyInput(v => ({ ...v, headRevision: e.target.value }))} /></label>
        <label>Manufacturer name<input required maxLength={120} value={assemblyInput.manufacturer} onChange={e => setAssemblyInput(v => ({ ...v, manufacturer: e.target.value }))} /></label>
        <label>Covered metals, comma separated<input required value={assemblyInput.metals} onChange={e => setAssemblyInput(v => ({ ...v, metals: e.target.value }))} /></label>
        <label>Covered sizes, comma separated<input required placeholder="4, 4.5, 5" value={assemblyInput.sizes} onChange={e => setAssemblyInput(v => ({ ...v, sizes: e.target.value }))} /></label>
        <label>Private drawing reference<input required maxLength={300} value={assemblyInput.evidenceReference} onChange={e => setAssemblyInput(v => ({ ...v, evidenceReference: e.target.value }))} /></label>
        <label>Drawing SHA-256<input required pattern={digestPattern} minLength={64} maxLength={64} value={assemblyInput.drawingDigest} onChange={e => setAssemblyInput(v => ({ ...v, drawingDigest: e.target.value }))} /></label>
      </div><button type="submit">Add specification to draft</button></form>{selectedSetting && <p className="rc-fine">Catalog metals: {selectedSetting.metals.join(', ')}. Catalog shapes: {selectedSetting.shapes.join(', ')}.</p>}
    </section>
    <section className="rc-card"><h2>2. Measured stones</h2>
      <div className="rc-table-wrap"><table><thead><tr><th>Stone</th><th>Measured millimetres</th><th>Evidence</th><th /></tr></thead><tbody>{draft.stones.map(s => <tr key={s.variantId}><td>{s.variantId}<small>{s.certificateLab} {s.certificateNumber} · {s.shape}</small></td><td>{s.lengthMm} × {s.widthMm} × {s.depthMm}</td><td>{s.evidenceReference}<small>SHA-256 {s.measurementDigest.slice(0, 12)}…</small></td><td><button type="button" onClick={() => setDraft(v => ({ ...v, approvals: v.approvals.filter(p => p.stoneVariantId !== s.variantId), stones: v.stones.filter(item => item.variantId !== s.variantId) }))}>Remove</button></td></tr>)}</tbody></table></div>
      <form onSubmit={e => { if (!selectedStone) return; addPart(e, 'stones', { variantId: selectedStone.variantId, shape: selectedStone.shape, certificateLab: selectedStone.certificateLab,
        certificateNumber: selectedStone.certificateNumber, lengthMm: Number(stoneInput.lengthMm), widthMm: Number(stoneInput.widthMm), depthMm: Number(stoneInput.depthMm),
        measurementDigest: stoneInput.measurementDigest.toLowerCase(), evidenceReference: stoneInput.evidenceReference }); }}><h3>Add certificate-backed measurements</h3><div className="rc-grid">
        <label>Mapped Shopify diamond<select value={stoneInput.variantId} onChange={e => setStoneInput(v => ({ ...v, variantId: e.target.value }))}>{d.diamonds.map(s => <option key={s.variantId} value={s.variantId}>{s.variantId} · {s.shape} · {s.certificateLab} {s.certificateNumber}</option>)}</select></label>
        {(['lengthMm', 'widthMm', 'depthMm'] as const).map(key => <label key={key}>{key === 'lengthMm' ? 'Length' : key === 'widthMm' ? 'Width' : 'Depth'} (mm)<input required type="number" step="0.01" min="0.01" max="50" value={stoneInput[key]} onChange={e => setStoneInput(v => ({ ...v, [key]: e.target.value }))} /></label>)}
        <label>Private measurement reference<input required maxLength={300} value={stoneInput.evidenceReference} onChange={e => setStoneInput(v => ({ ...v, evidenceReference: e.target.value }))} /></label>
        <label>Measurement evidence SHA-256<input required pattern={digestPattern} minLength={64} maxLength={64} value={stoneInput.measurementDigest} onChange={e => setStoneInput(v => ({ ...v, measurementDigest: e.target.value }))} /></label>
      </div><button type="submit" disabled={!selectedStone || draft.stones.some(s => s.variantId === selectedStone.variantId)}>Add measured stone to draft</button></form>
    </section>
    <section className="rc-card"><h2>3. Exact manufacturer approvals</h2>
      <div className="rc-table-wrap"><table><thead><tr><th>Head and stone</th><th>Covered combinations</th><th>Approval evidence</th><th /></tr></thead><tbody>{draft.approvals.map(a => <tr key={a.id}><td>{a.assemblyId}<small>Stone {a.stoneVariantId}</small></td><td>{a.metals.join(', ')}<small>Sizes {a.sizes.join(', ')}</small></td><td>{a.approvedBy} · {new Date(a.approvedAt).toLocaleDateString()}<small>{a.evidenceReference} · SHA-256 {a.evidenceDigest.slice(0, 12)}…</small></td><td><button type="button" onClick={() => setDraft(v => ({ ...v, approvals: v.approvals.filter(item => item.id !== a.id) }))}>Remove</button></td></tr>)}</tbody></table></div>
      <form onSubmit={e => { addPart(e, 'approvals', { id: crypto.randomUUID(), assemblyId: approvalInput.assemblyId, stoneVariantId: approvalInput.stoneVariantId,
        metals: list(approvalInput.metals) as Approval['metals'], sizes: list(approvalInput.sizes), approvedBy: approvalInput.approvedBy, approvedAt: approvalInput.approvedAt ? new Date(approvalInput.approvedAt).toISOString() : '',
        evidenceDigest: approvalInput.evidenceDigest.toLowerCase(), evidenceReference: approvalInput.evidenceReference }); }}><h3>Record an actual manufacturer sign-off</h3><div className="rc-grid">
        <label>Approved head<select required value={approvalInput.assemblyId} onChange={e => { const a = draft.assemblies.find(v => v.id === e.target.value); setApprovalInput(v => ({ ...v, assemblyId: e.target.value, metals: a?.metals.join(', ') || '', sizes: a?.sizes.join(', ') || '' })); }}><option value="">Choose head</option>{draft.assemblies.map(a => <option key={a.id} value={a.id}>{a.settingId} / {a.shape} / {a.headRevision}</option>)}</select></label>
        <label>Approved measured stone<select required value={approvalInput.stoneVariantId} onChange={e => setApprovalInput(v => ({ ...v, stoneVariantId: e.target.value }))}><option value="">Choose stone</option>{draft.stones.filter(s => !selectedAssembly || s.shape === selectedAssembly.shape).map(s => <option key={s.variantId} value={s.variantId}>{s.variantId} · {s.shape}</option>)}</select></label>
        <label>Approved metals<input required value={approvalInput.metals} onChange={e => setApprovalInput(v => ({ ...v, metals: e.target.value }))} /></label>
        <label>Approved sizes<input required value={approvalInput.sizes} onChange={e => setApprovalInput(v => ({ ...v, sizes: e.target.value }))} /></label>
        <label>Manufacturer approver<input required maxLength={120} value={approvalInput.approvedBy} onChange={e => setApprovalInput(v => ({ ...v, approvedBy: e.target.value }))} /></label>
        <label>Actual manufacturer approval date and time<input required type="datetime-local" value={approvalInput.approvedAt} onChange={e => setApprovalInput(v => ({ ...v, approvedAt: e.target.value }))} /></label>
        <label>Private approval reference<input required maxLength={300} value={approvalInput.evidenceReference} onChange={e => setApprovalInput(v => ({ ...v, evidenceReference: e.target.value }))} /></label>
        <label>Approval evidence SHA-256<input required pattern={digestPattern} minLength={64} maxLength={64} value={approvalInput.evidenceDigest} onChange={e => setApprovalInput(v => ({ ...v, evidenceDigest: e.target.value }))} /></label>
      </div><button type="submit" disabled={!draft.assemblies.length || !draft.stones.length}>Add approval to draft</button></form>
    </section>
    <Form method="post" onSubmit={e => { const button = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      if ((button?.value === 'publish' || button?.value === 'suspend') && !window.confirm(button.value === 'publish' ? 'Publish only if the manufacturer actually signed the referenced evidence?' : 'Suspend fitting approval and stop new fit-gated quotes?')) e.preventDefault(); }}>
      <input type="hidden" name="revision" value={revision} /><input type="hidden" name="manifest" value={JSON.stringify(draft)} />
      <div className="rc-actions"><button name="intent" value="save" disabled={busy || !dirty}>Save draft</button><button name="intent" value="validate" disabled={busy || dirty}>Validate saved evidence</button>
        <button name="intent" value="publish" className="rc-primary" disabled={busy || dirty || !draft.approvals.length}>Publish approved fitting</button>
        <button name="intent" value="suspend" disabled={busy || dirty || !d.state.activeVersion}>Suspend active approval</button></div>
      <p className="rc-fine">Saving and validation do not change storefront eligibility. Publication checks current Shopify mappings again. Suspension preserves historical designs and decisions.</p>
    </Form>
    <section className="rc-card"><h2>Publication history</h2>{d.history.length ? <div className="rc-table-wrap"><table><thead><tr><th>Release</th><th>Action</th><th>Operator</th><th>Time</th></tr></thead><tbody>{d.history.map(h => <tr key={h.id}><td><code>{h.id}</code></td><td>{h.action}</td><td>{h.actor}</td><td>{new Date(h.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p>No manufacturer release has been published.</p>}</section>
  </main>;
}
