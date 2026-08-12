import { renderAccountModuleRoute } from "../../../_platform/ModuleRoutePage";
export const dynamic="force-dynamic";
export default async function ModulePage({params}:{params:Promise<{locale:string;accountType:string;module:string}>}){const {locale,accountType,module}=await params;return renderAccountModuleRoute({locale,accountType,module:module as Parameters<typeof renderAccountModuleRoute>[0]["module"]});}
