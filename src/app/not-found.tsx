import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="text-center max-w-[440px]">
        <LogoMark size={30} className="mx-auto" />
        <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] mt-5">Record not found</h1>
        <p className="text-ink-3 mt-2 text-[0.9rem]">It may not exist, or it belongs to an institution your role cannot see.</p>
        <Link href="/" className="btn btn-primary mt-6">Back to overview</Link>
      </div>
    </div>
  );
}
