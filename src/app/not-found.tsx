import { NotFound } from "@/components/ui/not-found";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-svh w-full flex-col justify-center bg-background p-6 md:p-10">
      <NotFound title="페이지를 찾을 수 없습니다" description="" />
    </div>
  );
}
