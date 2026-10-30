import { Form, useActionData, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { login } from "../shopify.server";
export const loader = async ({ request }: LoaderFunctionArgs) => ({ errors: await login(request) });
export const action = async ({ request }: ActionFunctionArgs) => ({ errors: await login(request) });
export default function Login() {
  const result = useActionData<typeof action>() || useLoaderData<typeof loader>();
  return <main style={{ maxWidth: 600, margin: "80px auto", fontFamily: "system-ui" }}><h1>Connect Aevow Ring Pilot</h1><Form method="post"><label htmlFor="shop">Development-store domain</label><input id="shop" name="shop" required placeholder="your-store.myshopify.com" pattern="[a-z0-9-]+\.myshopify\.com" /><button type="submit">Continue to Shopify</button>{result.errors?.shop && <p role="alert">Enter a valid myshopify.com store domain.</p>}</Form></main>;
}
