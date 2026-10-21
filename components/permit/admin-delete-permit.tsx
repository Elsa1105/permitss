"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminDeletePermit({id}:{id:string}) {
 const router=useRouter(); const [open,setOpen]=useState(false), [confirm,setConfirm]=useState(""), [reason,setReason]=useState(""), [busy,setBusy]=useState(false), [error,setError]=useState("");
 return <div className="rounded-lg border border-red-200 p-3 space-y-2">
  {!open ? <button className="text-red-700 font-semibold" onClick={()=>setOpen(true)}>Archive draft permit (Admin)</button> : <>
   <p className="text-sm">Only draft permits may be archived. This keeps the audit history. Type DELETE to confirm.</p>
   <input className="w-full border p-2 rounded" placeholder="Reason for archiving" value={reason} onChange={e=>setReason(e.target.value)}/>
   <input className="w-full border p-2 rounded" placeholder="Type DELETE" value={confirm} onChange={e=>setConfirm(e.target.value)}/>
   {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
   <button disabled={busy || confirm!=="DELETE" || reason.trim().length<5} className="bg-red-700 text-white rounded px-3 py-2 disabled:opacity-50" onClick={async()=>{
    setBusy(true);setError(""); try {const res=await fetch(`/api/admin/permits/${id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmation:confirm,reason})}); const data=await res.json(); if(!res.ok) throw new Error(data.error||"Archive failed");router.replace("/permits");router.refresh();} catch(e){setError(e instanceof Error?e.message:"Archive failed");} finally{setBusy(false)}
   }}>Archive permit</button>
   <button className="ml-3" onClick={()=>setOpen(false)}>Cancel</button>
  </>}
 </div>;
}
