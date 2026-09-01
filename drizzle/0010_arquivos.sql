-- Upload de imagem, em vez de só link.

-- A foto de perfil e a mídia da campanha só podiam ser um endereço público. Na
-- prática isso obriga quem cadastra um canal a hospedar a imagem em algum
-- lugar antes de usar o sistema — e "algum lugar" acabava sendo um serviço
-- qualquer, com o link morrendo semanas depois e derrubando a campanha
-- seguinte sem ninguém entender por quê.
--
-- Os bytes moram no banco, não num serviço de arquivos. É uma escolha de
-- tamanho: uma foto de perfil tem dezenas de KB, cada cliente cadastra duas ou
-- três, e o teto por arquivo é o mesmo do Monitor de Envios (5 MB). Guardar
-- aqui evita mais uma credencial para configurar, mais um serviço para cair, e
-- mantém o arquivo com o mesmo ciclo de vida da organização: apagou o cliente,
-- apagou o arquivo.

CREATE TABLE IF NOT EXISTS media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo = arquivo da plataforma, usado por um provedor herdado.
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  byte_size integer NOT NULL,
  -- Nulos para o que não é imagem (PDF, áudio).
  width integer,
  height integer,
  original_name text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_files_org_ix ON media_files (org_id, created_at DESC);

-- Como toda tabela deste banco: RLS ligada e nenhuma policy para anon nem
-- authenticated. Quem lê é o servidor da aplicação, pela connection string.
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
