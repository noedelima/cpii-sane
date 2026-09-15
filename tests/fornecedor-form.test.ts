// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import FornecedorForm from "../src/components/FornecedorForm.vue";

const mocks = vi.hoisted(() => ({
  auth: { isSane: true },
  insert: vi.fn(),
  single: vi.fn(),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ insert: mocks.insert }) } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.isSane = true;
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
});

async function preencher(wrapper: ReturnType<typeof mount>) {
  const inputs = wrapper.findAll("input");
  await inputs[0].setValue(" TESTE ");
  await inputs[1].setValue(" Empresa Teste ");
}

describe("cadastro de fornecedor", () => {
  it("salva dados normalizados e emite o fornecedor persistido", async () => {
    const saved = { id: 42, codigo: "TESTE", razao_social: "Empresa Teste", status: "ativo" };
    mocks.single.mockResolvedValue({ data: saved, error: null });
    const wrapper = mount(FornecedorForm);
    await preencher(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.insert).toHaveBeenCalledWith({ codigo: "TESTE", razao_social: "Empresa Teste", cnpj: null, telefone: null, email: null, status: "ativo" });
    expect(wrapper.emitted("saved")).toEqual([[saved]]);
  });

  it("rejeita campos obrigatórios compostos só de espaços", async () => {
    const wrapper = mount(FornecedorForm);
    await wrapper.findAll("input")[0].setValue("   ");
    await wrapper.find("form").trigger("submit");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain("Informe o código");
  });

  it("bloqueia perfis sem permissão", async () => {
    mocks.auth.isSane = false;
    const wrapper = mount(FornecedorForm);
    await preencher(wrapper);
    await wrapper.find("form").trigger("submit");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["23505", "duplicate key", "Já existe um fornecedor"],
    ["42501", "Acesso negado", "Acesso negado"],
  ])("preserva os dados e informa falhas %s", async (code, message, expected) => {
    mocks.single.mockResolvedValue({ data: null, error: { code, message } });
    const wrapper = mount(FornecedorForm);
    await preencher(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(expected);
    expect((wrapper.findAll("input")[0].element as HTMLInputElement).value).toBe(" TESTE ");
    expect(wrapper.emitted("saved")).toBeUndefined();
  });

  it("impede envio duplicado enquanto a gravação está pendente", async () => {
    mocks.single.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(FornecedorForm);
    await preencher(wrapper);
    await wrapper.find("form").trigger("submit");
    await wrapper.find("form").trigger("submit");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
  });
});
