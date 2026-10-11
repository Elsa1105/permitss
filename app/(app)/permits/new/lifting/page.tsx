import NewPermitPage from "../page";

// /permits/new/lifting -> same page as /permits/new, in Lifting mode.
export default async function NewLiftingPermitPage() {
  return NewPermitPage({ searchParams: Promise.resolve({ type: "lifting" }) });
}
