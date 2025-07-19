/**
 * 検索エンジンクラス
 */
class SearchEngine {
    /**
     * レコードを検索
     */
    searchRecords(appId) {
        const searchConditions = this.getSearchConditions(appId);
        
        if (Object.keys(searchConditions).length === 0) {
            alert(CONFIG.system.messages.noSearchCondition);
            return;
        }

        const query = this.buildSearchQuery(searchConditions, appId);
        
        console.log(`App ${appId}（${CONFIG.apps[appId].name}）で検索実行:`, query);
        
        // メインの台帳を検索
        this.searchRecordsWithQuery(appId, query)
            .then((records) => {
                console.log(`${CONFIG.apps[appId].name}の検索結果（${records.length}件）:`, records);
                
                if (records.length > 0) {
                    // 統合キーを抽出して他の台帳も検索
                    return window.dataIntegrator.searchAllLedgersWithIntegrationKeys(appId, records);
                } else {
                    console.log(CONFIG.system.messages.noResults);
                    return null;
                }
            })
            .then((integratedData) => {
                if (integratedData) {
                    console.log('=== 統合データベース ===');
                    console.log(`統合されたレコード数: ${integratedData.length}件`);
                    console.log('統合データ:', integratedData);
                    
                    // テーブル表示
                    if (window.tableRenderer) {
                        window.tableRenderer.displayIntegratedTable(appId, integratedData);
                    }
                }
            })
            .catch((error) => {
                console.error('検索エラー:', error);
                alert(CONFIG.system.messages.searchError);
            });
    }

    /**
     * 検索条件を取得
     */
    getSearchConditions(appId) {
        const conditions = {};
        const fields = CONFIG.getAppFields(appId);
        
        if (!fields) return conditions;

        fields.forEach(field => {
            const input = document.getElementById(`${field.code}-${appId}`);
            if (input && input.value && input.value.trim() !== '') {
                conditions[field.code] = input.value.trim();
            }
        });

        return conditions;
    }

    /**
     * 検索クエリを構築（AND条件）
     */
    buildSearchQuery(conditions, appId) {
        const queryParts = [];
        const fields = CONFIG.getAppFields(appId);

        for (const [fieldCode, value] of Object.entries(conditions)) {
            const fieldConfig = fields.find(field => field.code === fieldCode);
            
            if (fieldConfig && fieldConfig.type === 'dropdown') {
                queryParts.push(`${fieldCode} in ("${value}")`);
            } else {
                queryParts.push(`${fieldCode} like "${value}"`);
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