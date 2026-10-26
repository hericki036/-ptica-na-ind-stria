# Trabalho Avaliativo – Equals, HashCode e Set (Java)

**Nome:** ____________________________________________

**Nº da chamada:** ______  **Turma:** ________  **Data:** ___/___/______

---

## 1. O sistema

**Sistema de Controle de Visitantes** de uma empresa. Cada visitante tem CPF, nome e empresa.
Regra: **um visitante não pode ser cadastrado duas vezes**. Dois visitantes com o **mesmo CPF**
são a mesma pessoa, mesmo que o nome tenha sido digitado diferente ("Ana Souza" e "ANA SOUZA").

Para isso o sistema usa:
- `equals()` → diz quando dois visitantes são iguais (mesmo CPF);
- `hashCode()` → gera o "código" usado pelo `HashSet` para guardar e achar o visitante;
- `Set` (`HashSet`) → coleção que **não aceita elementos repetidos**.

**Como rodar na IDE (Eclipse, NetBeans, IntelliJ ou VS Code):** criar um projeto Java, criar o arquivo
`SistemaVisitantes.java`, colar o código abaixo e executar (Run). Não precisa de biblioteca extra.

## 2. Código

```java
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
```

## 3. Saída ao executar

```
=== 1) Cadastro de visitantes ===
Cadastrado: Ana Souza (CPF 111.111.111-11) - Óptica Visão
Cadastrado: Bruno Lima (CPF 222.222.222-22) - Metalúrgica Sul
Cadastrado: Carla Dias (CPF 333.333.333-33) - Lentes Brasil
JÁ CADASTRADO (CPF repetido): ANA SOUZA (CPF 111.111.111-11) - Óptica Visão

--- Visitantes cadastrados (3) ---
  Ana Souza (CPF 111.111.111-11) - Óptica Visão
  Bruno Lima (CPF 222.222.222-22) - Metalúrgica Sul
  Carla Dias (CPF 333.333.333-33) - Lentes Brasil

=== 2) Testando equals e hashCode ===
a == b ?        false  (objetos diferentes na memória)
a.equals(b) ?   true   (mesmo CPF)
hashCode a = 1484152652 | hashCode b = 1484152652

=== 3) Busca e remoção ===
Visitante com CPF 222.222.222-22 está cadastrado.
Visitante com CPF 999.999.999-99 NÃO está cadastrado.
Removido CPF 222.222.222-22

--- Visitantes cadastrados (2) ---
  Ana Souza (CPF 111.111.111-11) - Óptica Visão
  Carla Dias (CPF 333.333.333-33) - Lentes Brasil
```

*(A ordem da listagem pode mudar, porque o `HashSet` não garante ordem.)*

## 4. Explicação dos conceitos

### equals()
É o método que diz se **dois objetos são iguais pelo conteúdo**. Todo objeto Java herda `equals()` da
classe `Object`, mas a versão original só compara **endereços de memória** (igual ao `==`): dois objetos
criados com `new` seriam sempre diferentes, mesmo com os mesmos dados.

Por isso **sobrescrevemos** (`@Override`) o `equals()` na classe `Visitante` para comparar pelo **CPF**.
No exemplo, `a == b` dá `false` (são dois objetos na memória), mas `a.equals(b)` dá `true` (mesmo CPF).

Regras que um bom `equals()` segue:
- **Reflexivo:** `x.equals(x)` é sempre `true`;
- **Simétrico:** se `x.equals(y)`, então `y.equals(x)`;
- **Transitivo:** se `x.equals(y)` e `y.equals(z)`, então `x.equals(z)`;
- **Consistente:** chamar várias vezes dá o mesmo resultado se nada mudou;
- `x.equals(null)` é sempre `false`.

### hashCode()
Retorna um **número inteiro** que representa o objeto. Coleções do tipo *hash* (`HashSet`, `HashMap`)
usam esse número para decidir em qual "gaveta" (*bucket*) o objeto fica, o que torna a busca muito rápida.

**Contrato entre equals e hashCode:**
- Se `a.equals(b)` é `true`, então `a.hashCode()` **tem que ser igual** a `b.hashCode()`;
- Dois objetos com o mesmo `hashCode` **podem** ser diferentes (é a chamada *colisão*); aí o `equals` decide.

Por isso o `hashCode()` usa **os mesmos campos do `equals()`** — aqui, só o CPF (`Objects.hash(cpf)`).
Se sobrescrevermos só o `equals` e esquecermos o `hashCode`, o `HashSet` aceitaria visitantes repetidos,
porque cada objeto teria um hashCode diferente e cairia em outra gaveta.

### Set (HashSet)
`Set` é uma interface de coleção que **não permite elementos duplicados** (como um conjunto da matemática).
O `HashSet` é a implementação mais usada: rápida, mas **não mantém ordem**.
(`LinkedHashSet` mantém a ordem de inserção e `TreeSet` mantém ordenado.)

Como o `HashSet` decide se um elemento é repetido:
1. Calcula o `hashCode()` do objeto e vai até a gaveta correspondente;
2. Compara com os objetos daquela gaveta usando `equals()`;
3. Se algum for igual, **não adiciona** e `add()` retorna `false`.

No sistema isso aparece em:
- `cadastrar()` → `visitantes.add(v)` retorna `false` para a "ANA SOUZA" (CPF repetido);
- `buscar()` → `contains()` acha o visitante só pelo CPF;
- `remover()` → `remove()` apaga o visitante só pelo CPF.

## 5. Conclusão
Sobrescrevendo `equals()` e `hashCode()` de forma coerente, o `HashSet` passa a entender quando dois
visitantes são a mesma pessoa. Assim o sistema impede cadastros duplicados sem precisar de nenhum `if`
de comparação manual: a própria coleção cuida disso.
