import {requireAdmin} from "@/lib/auth/require-admin";import {getDb} from "@/lib/db";import {BackupsBoard} from "@/components/admin/backups-board";
export default async function BackupsPage(){await requireAdmin();const runs=await getDb().backupRun.findMany({orderBy:{startedAt:"desc"},take:30});return <BackupsBoard runs={runs}/>}
