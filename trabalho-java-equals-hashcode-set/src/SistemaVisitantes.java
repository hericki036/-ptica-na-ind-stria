import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

/*
 * Trabalho Avaliativo - Equals, HashCode e Set
 * Aluno(a): ______________________   Nº da chamada: ____
 *
 * Sistema de controle de visitantes de uma empresa.
 * Dois visitantes são considerados IGUAIS quando têm o mesmo CPF,
 * mesmo que o nome tenha sido digitado de forma diferente.
 * O Set não deixa cadastrar o mesmo visitante duas vezes.
 */
class Visitante {
    private String cpf;
    private String nome;
    private String empresa;

    public Visitante(String cpf, String nome, String empresa) {
        this.cpf = cpf;
        this.nome = nome;
        this.empresa = empresa;
    }

    public String getCpf() { return cpf; }
    public String getNome() { return nome; }
    public String getEmpresa() { return empresa; }

    // equals: define quando dois objetos são "iguais" (aqui: mesmo CPF)
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;                      // mesmo objeto na memória
        if (obj == null || getClass() != obj.getClass()) return false;
        Visitante outro = (Visitante) obj;
        return Objects.equals(cpf, outro.cpf);             // compara pelo CPF
    }

    // hashCode: precisa usar os MESMOS campos do equals
    @Override
    public int hashCode() {
        return Objects.hash(cpf);
    }

    @Override
    public String toString() {
        return nome + " (CPF " + cpf + ") - " + empresa;
    }
}

public class SistemaVisitantes {

    private Set<Visitante> visitantes = new HashSet<>();

    public void cadastrar(Visitante v) {
        // add() retorna false se já existir um objeto igual (equals) no Set
        if (visitantes.add(v)) {
            System.out.println("Cadastrado: " + v);
        } else {
            System.out.println("JÁ CADASTRADO (CPF repetido): " + v);
        }
    }

    public void buscar(String cpf) {
        // contains() usa hashCode + equals para achar o objeto
        boolean existe = visitantes.contains(new Visitante(cpf, "", ""));
        System.out.println("Visitante com CPF " + cpf + (existe ? " está" : " NÃO está") + " cadastrado.");
    }

    public void remover(String cpf) {
        boolean removeu = visitantes.remove(new Visitante(cpf, "", ""));
        System.out.println(removeu ? "Removido CPF " + cpf : "CPF " + cpf + " não encontrado.");
    }

    public void listar() {
        System.out.println("\n--- Visitantes cadastrados (" + visitantes.size() + ") ---");
        for (Visitante v : visitantes) {
            System.out.println("  " + v);
        }
        System.out.println();
    }

    public static void main(String[] args) {
        SistemaVisitantes sistema = new SistemaVisitantes();

        System.out.println("=== 1) Cadastro de visitantes ===");
        sistema.cadastrar(new Visitante("111.111.111-11", "Ana Souza", "Óptica Visão"));
        sistema.cadastrar(new Visitante("222.222.222-22", "Bruno Lima", "Metalúrgica Sul"));
        sistema.cadastrar(new Visitante("333.333.333-33", "Carla Dias", "Lentes Brasil"));
        // mesmo CPF da Ana, nome escrito diferente -> equals diz que é igual
        sistema.cadastrar(new Visitante("111.111.111-11", "ANA SOUZA", "Óptica Visão"));
        sistema.listar();

        System.out.println("=== 2) Testando equals e hashCode ===");
        Visitante a = new Visitante("444.444.444-44", "Diego", "X");
        Visitante b = new Visitante("444.444.444-44", "Diego Rocha", "Y");
        System.out.println("a == b ?        " + (a == b) + "  (objetos diferentes na memória)");
        System.out.println("a.equals(b) ?   " + a.equals(b) + "   (mesmo CPF)");
        System.out.println("hashCode a = " + a.hashCode() + " | hashCode b = " + b.hashCode());

        System.out.println("\n=== 3) Busca e remoção ===");
        sistema.buscar("222.222.222-22");
        sistema.buscar("999.999.999-99");
        sistema.remover("222.222.222-22");
        sistema.listar();
    }
}
