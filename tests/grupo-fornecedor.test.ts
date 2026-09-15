// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import GrupoFormView from "../src/views/GrupoFormView.vue";
import FornecedorForm from "../src/components/FornecedorForm.vue";

vi.mock("vue-router", () => ({ useRoute: () => ({ params: {} }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isSane: true }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }),
} }));

it("seleciona o fornecedor criado sem perder o nome do grupo em preenchimento", async () => {
  const wrapper = mount(GrupoFormView);
  await flushPromises();
  const nome = wrapper.get('input[placeholder="Grupo XI - Categoria - FORNECEDOR"]');
  await nome.setValue("Grupo XI - Novo contrato");
  const abrir = wrapper.findAll("button").find(b => b.text() === "+ Novo fornecedor")!;
  await abrir.trigger("click");
  const form = wrapper.getComponent(FornecedorForm);
  form.vm.$emit("saved", { id: 99, codigo: "NOVA", razao_social: "Nova Empresa", cnpj: "123", status: "ativo" });
  await flushPromises();
  expect((nome.element as HTMLInputElement).value).toBe("Grupo XI - Novo contrato");
  expect(wrapper.findComponent(FornecedorForm).exists()).toBe(false);
  const option = wrapper.get('option[value="99"]').element as HTMLOptionElement;
  expect(option.selected).toBe(true);
  expect(option.textContent).toContain("Nova Empresa");
  expect((wrapper.get('input[placeholder="00.000.000/0000-00"]').element as HTMLInputElement).value).toBe("123");
});
