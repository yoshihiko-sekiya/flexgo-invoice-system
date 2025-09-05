/// <reference types="cypress" />

describe('Reports Preview - PDF Generation', () => {
  it('should generate PDF successfully with valid form data', () => {
    // E2E認証バイパスでアクセス
    cy.visit('/reports/preview?e2e=1')

    // 画面の初期化待ち（Ionのハイドレーション想定）
    cy.get('ion-app', { timeout: 20000 }).should('exist')
    cy.contains('レポート プレビュー').should('be.visible')
    
    // Shadow DOM経由での入力
    const today = new Date().toISOString().slice(0, 10)
    cy.get('ion-input[data-cy="date"]').shadow().find('input').clear().type(today)
    cy.get('ion-input[data-cy="driver"]').shadow().find('input').clear().type('山田太郎')
    cy.get('ion-input[data-cy="count"]').shadow().find('input').clear().type('5')
    cy.get('ion-input[data-cy="distance"]').shadow().find('input').clear().type('120')
    cy.get('ion-textarea[data-cy="note"]').shadow().find('textarea').clear().type('E2E OK')

    // プレビュー更新ボタンをクリックしてHTMLプレビューを生成
    cy.contains('プレビュー更新').click()
    
    // プレビュー領域が安定するまで待機
    cy.get('.html-preview').should('be.visible')
    cy.wait(1000) // レンダリング安定化待ち
    
    // プレビュー領域のビジュアル回帰テスト
    cy.get('.html-preview').toMatchSnapshot('report-preview')

    // API intercept はクリック前に
    cy.intercept('POST', '**/api/reports/pdf').as('pdf')

    // PDF生成ボタンをクリック
    cy.get('[data-cy="generate"]').click()
    
    // API呼び出しを待機して検証
    cy.wait('@pdf').its('response.statusCode').should('eq', 200)
    
    // 画面にbytesが反映されていることを確認
    cy.get('[data-cy="result-bytes"]').should('exist').and(($el) => {
      expect($el.text()).to.match(/バイト数:\s*[1-9]\d*/)
    })
    
    // 操作タイプが正しいことを確認
    cy.get('[data-cy="result-operation"]').should('contain', 'download')
  })

  it('should save PDF to storage successfully', () => {
    // E2E認証バイパスでアクセス
    cy.visit('/reports/preview?e2e=1')
    
    // 画面の初期化待ち
    cy.get('ion-app', { timeout: 20000 }).should('exist')
    
    // Shadow DOM経由での入力
    const today = new Date().toISOString().slice(0, 10)
    cy.get('ion-input[data-cy="date"]').shadow().find('input').clear().type(today)
    cy.get('ion-input[data-cy="driver"]').shadow().find('input').clear().type('山田太郎')
    cy.get('ion-input[data-cy="count"]').shadow().find('input').clear().type('5')
    cy.get('ion-input[data-cy="distance"]').shadow().find('input').clear().type('120')
    
    // API intercept for save endpoint
    cy.intercept('POST', '**/api/reports/pdf/save').as('pdfSave')
    
    // PDF保存ボタンをクリック
    cy.get('[data-cy="save"]').click()
    
    // API呼び出しを待機して検証
    cy.wait('@pdfSave').its('response.statusCode').should('eq', 200)
    
    // レスポンス構造の確認
    cy.get('@pdfSave').then((interception) => {
      expect(interception.response.body).to.have.property('success', true)
      expect(interception.response.body).to.have.property('url')
      expect(interception.response.body.url).to.include('http')
    })
    
    // 画面結果の確認
    cy.get('[data-cy="result-bytes"]').should('exist')
    cy.get('[data-cy="result-url"]').should('exist')
    cy.get('[data-cy="result-operation"]').should('contain', 'save')
  })

  it('should handle API errors gracefully', () => {
    // E2E認証バイパスでアクセス
    cy.visit('/reports/preview?e2e=1')
    
    // 画面の初期化待ち
    cy.get('ion-app', { timeout: 20000 }).should('exist')
    
    // Shadow DOM経由での入力
    const today = new Date().toISOString().slice(0, 10)
    cy.get('ion-input[data-cy="date"]').shadow().find('input').clear().type(today)
    cy.get('ion-input[data-cy="driver"]').shadow().find('input').clear().type('エラーテスト')
    cy.get('ion-input[data-cy="count"]').shadow().find('input').clear().type('5')
    cy.get('ion-input[data-cy="distance"]').shadow().find('input').clear().type('100')
    
    // Mock API error
    cy.intercept('POST', '**/api/reports/pdf', {
      statusCode: 500,
      body: { error: 'Internal server error' }
    }).as('pdfError')
    
    // PDF生成ボタンをクリック
    cy.get('[data-cy="generate"]').click()
    
    // エラーレスポンスの確認
    cy.wait('@pdfError').its('response.statusCode').should('eq', 500)
    
    // 結果表示が表示されていないことを確認（エラー時は null）
    cy.get('[data-cy="result"]').should('not.exist')
  })
})