import {
  LanguageService as HtmlLanguageService,
  TokenType,
  getLanguageService,
} from 'vscode-html-languageservice';
import * as vscode from 'vscode';
import {
  LanguageService as cssLanguageService,
  getCSSLanguageService,
} from 'vscode-css-languageservice';
import { TextDocument as ServerTextDocument } from 'vscode-languageserver-textdocument';
// 注意 vscode.TextDocument 和 lsp的TextDocument不一样

export function activate(context: vscode.ExtensionContext) {
  function ensureAttribute(
    htmlLanguageService: HtmlLanguageService,
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    console.log('scan');

    //1. html 需要通过LanguageService的scanner来进行扫描
    const scanner = htmlLanguageService.createScanner(document.getText());
    // position 当前光标 通过offsetAt(position)获取当前光标所在文档的偏移值（文档第一行第一列为0）
    const offset = document.offsetAt(position);
    let lastAttributeName: string | null = null;
    let token = scanner.scan();
    // EOS 文档结束符
    while (token !== TokenType.EOS) {
      switch (token) {
        case TokenType.AttributeName: {
          // 当前扫描到的符号的偏移值：scanner.getTokenOffset()
          // 当前扫描到的符号的长度  scanner.getTokenLength()
          // 当前扫描到的文本  scanner.getTokenText()
          // 当前扫描到的文本末尾 scanner.getTokenEnd()
          // 记录 属性名"
          lastAttributeName = scanner.getTokenText();
          break;
        }
        case TokenType.AttributeValue:
          if (!lastAttributeName) {
            break;
          }
          if (lastAttributeName === 'class') {
            // 判断 position 的 offset 的位置符合要求
            if (
              offset > scanner.getTokenOffset() &&
              offset < scanner.getTokenEnd()
            ) {
              return true;
            }
          }
        // eslint-disable-next-line no-fallthrough
        default: {
          break;
        }
      }
      token = scanner.scan();
    }
    return false;
  }
  async function parseCss(
    cssLanguageService: cssLanguageService,
    htmlDocument: vscode.TextDocument
  ) {
    /* 构造 css 文件的路径 */
    const cssUri = htmlDocument.uri.with({
      path: htmlDocument.uri.path.slice(0, -4) + 'css',
    });

    /* 通过 vscode 的 API 打开该文件 */
    const cssDocument = await vscode.workspace.openTextDocument(cssUri);

    /* 因为类型要求，所以要重新构造 textDocument */
    const styleDocument = ServerTextDocument.create(
      cssUri.toString(),
      'css',
      cssDocument.version,
      cssDocument.getText()
    );

    /* 解析得到 stylesheet AST */
    return cssLanguageService.parseStylesheet(styleDocument);
  }
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "classcomplete" is now active!');
  const cssLanguageService = getCSSLanguageService();
  const htmlLanguageService = getLanguageService();
  const provider = {
    async provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: any,
      context: any
    ): Promise<any> {
      /* 返回 CompletionItem 数组，也可以返回 Promise<CompletionItem[]> 的异步结果 */
      const attributeResult = ensureAttribute(
        htmlLanguageService,
        document,
        position
      );
      if (!attributeResult) {
        return [];
      }
      const stylesheet = await parseCss(cssLanguageService, document);

      // 类名去重
      const raw: Set<string> = new Set();
      // 遍历 stylesheet AST node
      (stylesheet as any).accept((node: any) => {
        // ClassSelector 类选择器的 enum 值为 14
        // https://github.com/microsoft/vscode-css-languageservice/blob/main/src/parser/cssNodes.ts#L29
        if (node.type === 14) {
          // 去掉首位字符 `.`
          raw.add(node.getText().substr(1));
        }
        // 返回 true 使得子节点的遍历能够继续
        return true;
      });
      // 构造 CompletionItem 并返回结果
      return Array.from(raw).map(
        (selector) =>
          new vscode.CompletionItem(selector, vscode.CompletionItemKind.Color)
      );
    },
  };
  vscode.languages.registerCompletionItemProvider(
    { language: 'html' },
    provider,
    '"'
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
