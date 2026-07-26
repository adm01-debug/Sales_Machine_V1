-- v_pipeline_health é uma materialized view exposta na Data API com ACL
-- excessiva (anon com arwdDxtm). Ela agrega métricas operacionais internas:
-- visitante anônimo não deve enxergá-la, e usuário autenticado só precisa ler.
REVOKE ALL ON public.v_pipeline_health FROM anon;
REVOKE ALL ON public.v_pipeline_health FROM authenticated;
GRANT SELECT ON public.v_pipeline_health TO authenticated;
GRANT ALL ON public.v_pipeline_health TO service_role;