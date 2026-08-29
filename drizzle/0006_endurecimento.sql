-- Endurecimento apontado pelo linter do Supabase.
--
-- 1. `_migrations` ficou sem RLS. O conteúdo é só nome de arquivo, mas ela
--    está num schema exposto ao PostgREST — e "não é grave" não é motivo para
--    deixar uma tabela aberta.
ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE _migrations FORCE ROW LEVEL SECURITY;

DO $$
DECLARE dono text;
BEGIN
  SELECT tableowner INTO dono FROM pg_tables
   WHERE tablename = '_migrations' AND schemaname = 'public';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE _migrations FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE _migrations FROM authenticated';
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS app_total ON _migrations');
  EXECUTE format(
    'CREATE POLICY app_total ON _migrations FOR ALL TO %I USING (true) WITH CHECK (true)',
    dono
  );
END $$;

-- 2. Funções sem `search_path` fixo.
--
--    Sem ele, quem puder criar um objeto num schema que venha antes no
--    search_path da sessão consegue sequestrar uma chamada não qualificada
--    dentro da função. Aqui as funções são SECURITY INVOKER, então o risco é
--    menor — mas fixar custa uma linha e fecha a porta de vez.
ALTER FUNCTION aplicar_credito() SET search_path = public, pg_temp;
ALTER FUNCTION tocar_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION contar_lista() SET search_path = public, pg_temp;
ALTER FUNCTION contar_campanha() SET search_path = public, pg_temp;

-- As extensões `citext` e `pg_trgm` ficam no schema `public` de propósito:
-- mover exigiria requalificar o tipo de várias colunas e os índices trigram,
-- e o ganho — cosmético — não paga a migration de tipo em tabela grande.
