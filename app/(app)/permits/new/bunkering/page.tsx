import NewPermitPage from "../page";

// /permits/new/bunkering -> same page as /permits/new, in Bunkering mode.
export default async function NewBunkeringPermitPage() {
  return NewPermitPage({ searchParams: Promise.resolve({ type: "bunkering" }) });
}
