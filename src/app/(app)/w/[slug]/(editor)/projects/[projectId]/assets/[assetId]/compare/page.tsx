import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { VersionCompare } from "@/components/review/version-compare";
import { requireUser } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { paths } from "@/lib/paths";
import { getCompareData } from "@/server/compare-page";

export const metadata: Metadata = { title: "Compare versions" };

export default async function ComparePage(props: PageProps<"/w/[slug]/projects/[projectId]/assets/[assetId]/compare">) {
  const { slug, projectId, assetId } = await props.params;
  const search = await props.searchParams;
  const user = await requireUser();

  let data;
  try {
    data = await getCompareData(
      { kind: "member", userId: user.id },
      assetId,
      typeof search.a === "string" ? search.a : null,
      typeof search.b === "string" ? search.b : null,
    );
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "INVALID") redirect(paths.asset(slug, projectId, assetId));
    throw error;
  }
  if (data.asset.projectId !== projectId) notFound();

  return (
    <VersionCompare
      scope={{ kind: "workspace", slug, projectId }}
      asset={{ id: data.asset.id, name: data.asset.name, projectName: data.asset.projectName }}
      versions={data.versions}
      left={data.left}
      right={data.right}
    />
  );
}
