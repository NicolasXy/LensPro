// spiderman
import { useAuth } from "../auth";
import { useCart } from "../cart";
import { useToast } from "../toast";
import { Foto } from "../types";

/** Botao de carrinho: so aparece para visitantes e compradores (fotografos e admins nao compram). */
export default function BotaoCarrinho({ foto, grande }: { foto: Foto; grande?: boolean }) {
  const { usuario } = useAuth();
  const { tem, adicionar, remover } = useCart();
  const avisar = useToast();
  if (usuario && usuario.papel !== "comprador") return null;
  const dentro = tem(foto.id);
  return (
    <button
      className={"btn " + (grande ? "btn-block" : "btn-sm") + (dentro ? " btn-ghost" : "")}
      onClick={() => {
        if (dentro) remover(foto.id);
        else {
          adicionar(foto);
          avisar("Foto adicionada ao carrinho.");
        }
      }}
    >
      {dentro ? "No carrinho" : grande ? "Adicionar ao carrinho" : "+ Carrinho"}
    </button>
  );
}
