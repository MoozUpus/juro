export function GET(request:Request,{params}:{params:Promise<{locale:string}>}){return redirect(request,params);}
async function redirect(request:Request,params:Promise<{locale:string}>){const {locale}=await params;return Response.redirect(new URL(`/register?lang=${locale==="uz"?"uz":"ru"}`,request.url),308);}
