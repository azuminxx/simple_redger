/**
 * 検索エンジンクラス
 */
class SearchEngine {
    /**
     * レコードを検索
     */
    async searchRecords(appId) {
        try {
            const searchConditions = await this.getSearchConditions(appId);
            
            if (Object.keys(searchConditions).length === 0) {
                alert(CONFIG.system.messages.noSearchCondition);
                return;
            }

            const query = await this.buildSearchQuery(searchConditions, appId);
            
            console.log(`App ${appId}（${CONFIG.apps[appId].name}）で検索実行:`, query);
            
            // メインの台帳を検索
            const records = await this.searchRecordsWithQuery(appId, query);
            console.log(`${CONFIG.apps[appId].name}の検索結果（${records.length}件）:`, records);
            
            if (records.length > 0) {
                // 統合キーを抽出して他の台帳も検索
                const integratedData = await window.dataIntegrator.searchAllLedgersWithIntegrationKeys(appId, records);
                
                if (integratedData) {
                    console.log('=== 統合データベース ===');
                    console.log(`統合されたレコード数: ${integratedData.length}件`);
                    console.log('統合データ:', integratedData);
                    
                    // テーブル表示
                    if (window.tableRenderer) {
                        window.tableRenderer.displayIntegratedTable(appId, integratedData);
                    }
                }
            } else {
                console.log(CONFIG.system.messages.noResults);
            }
        } catch (error) {
            console.error('検索エラー:', error);
            alert(`${CONFIG.system.messages.searchError}\n詳細: ${error.message}`);
        }
    }

    /**
     * 検索条件を取得（動的フィールド情報対応）
     */
    async getSearchConditions(appId) {
        const conditions = {};
        
        try {
            const fields = await CONFIG.getAppFields(appId);
            
            fields.forEach(field => {
                if (field.type === 'checkbox') {
                    // チェックボックスの場合は複数の値を取得
                    const checkboxes = document.querySelectorAll(`input[name="${field.code}-${appId}"]:checked`);
                    const values = Array.from(checkboxes).map(cb => cb.value);
                    if (values.length > 0) {
                        conditions[field.code] = values;
                    }
                } else {
                    // その他のフィールドは単一値を取得
                    const input = document.getElementById(`${field.code}-${appId}`);
                    if (input && input.value && input.value.trim() !== '') {
                        conditions[field.code] = input.value.trim();
                    }
                }
            });
        } catch (error) {
            console.error(`App ${appId}の検索条件取得エラー:`, error);
        }

        return conditions;
    }

    /**
     * 検索クエリを構築（動的フィールド情報対応）
     */
    async buildSearchQuery(conditions, appId) {
        const queryParts = [];
        
        try {
            const fields = await CONFIG.getAppFields(appId);

            for (const [fieldCode, value] of Object.entries(conditions)) {
                const fieldConfig = fields.find(field => field.code === fieldCode);
                
                if (!fieldConfig) {
                    console.warn(`フィールド ${fieldCode} の設定が見つかりません`);
                    continue;
                }
                
                if (fieldConfig.type === 'dropdown' || fieldConfig.type === 'radio') {
                    queryParts.push(`${fieldCode} in ("${value}")`);
                } else if (fieldConfig.type === 'checkbox' && Array.isArray(value)) {
                    // チェックボックスの場合は OR 条件で結合
                    const checkboxQueries = value.map(v => `${fieldCode} like "${v}"`);
                    if (checkboxQueries.length > 0) {
                        queryParts.push(`(${checkboxQueries.join(' or ')})`);
                    }
                } else if (fieldConfig.type === 'number') {
                    // 数値フィールドは完全一致
                    queryParts.push(`${fieldCode} = ${value}`);
                } else if (fieldConfig.type === 'date' || fieldConfig.type === 'datetime-local') {
                    // 日付フィールドは範囲検索も可能だが、ここでは完全一致
                    queryParts.push(`${fieldCode} = "${value}"`);
                } else {
                    // テキストフィールドは部分一致
                    queryParts.push(`${fieldCode} like "${value}"`);
                }
            }
        } catch (error) {
            console.error(`App ${appId}の検索クエリ構築エラー:`, error);
            // エラー時は基本的な like 検索にフォールバック
            for (const [fieldCode, value] of Object.entries(conditions)) {
                if (Array.isArray(value)) {
                    const queries = value.map(v => `${fieldCode} like "${v}"`);
                    queryParts.push(`(${queries.join(' or ')})`);
                } else {
                    queryParts.push(`${fieldCode} like "${value}"`);
                }
            }
        }

        return queryParts.join(' and ');
    }

    /**
     * クエリでレコードを検索（カーソルAPI使用）
     */
    searchRecordsWithQuery(appId, query) {
        return this.createCursor(appId, query)
            .then((cursorId) => {
                console.log('検索用カーソルが作成されました:', cursorId);
                return this.getAllRecordsFromCursor(cursorId);
            });
    }

    /**
     * カーソルを作成
     */
    createCursor(appId, query) {
        const body = {
            app: appId,
            query: query || '',
            size: CONFIG.system.cursorSize
        };

        return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'POST', body)
            .then((response) => {
                return response.id;
            });
    }

    /**
     * カーソルを使用して全レコードを取得
     */
    getAllRecordsFromCursor(cursorId) {
        const allRecords = [];

        const fetchRecords = () => {
            const body = {
                id: cursorId
            };

            return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'GET', body)
                .then((response) => {
                    allRecords.push(...response.records);
                    
                    console.log('現在までに取得したレコード数:', allRecords.length);
                    
                    if (response.next) {
                        return fetchRecords();
                    } else {
                        return allRecords;
                    }
                });
        };

        return fetchRecords();
    }
}

// グローバルに公開
window.SearchEngine = SearchEngine; 