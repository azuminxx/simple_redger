/**
 * データ統合クラス
 */
class DataIntegrator {
    /**
     * 統合キーを使って全台帳を検索
     */
    searchAllLedgersWithIntegrationKeys(originalAppId, originalRecords) {
        // 統合キーを抽出
        const integrationKeys = this.extractIntegrationKeys(originalRecords);
        
        if (integrationKeys.length === 0) {
            console.log(CONFIG.system.messages.noIntegrationKeys);
            return Promise.resolve([]);
        }

        // 統合キー抽出ログは削除

        // 全台帳のデータを格納するオブジェクト
        const allLedgerData = {};
        allLedgerData[originalAppId] = originalRecords;

        // 他の台帳を検索するPromiseを作成（ユーザー台帳は除外）
        const searchPromises = [];
        
        Object.keys(CONFIG.apps).forEach(appId => {
            if (appId !== originalAppId) {
                // 主キー検索のみ実行
                const promise = this.searchByPrimaryKeys(appId, integrationKeys)
                    .then(records => {
                        allLedgerData[appId] = records;
                        console.log(`🔍 ${CONFIG.apps[appId].name}の主キー検索結果: ${records.length}件`);
                        return records;
                    });
                searchPromises.push(promise);
            }
        });

        // ユーザー台帳をBSSIDで検索するPromiseを追加
        const userListPromise = this.searchUserListByUserIds(allLedgerData)
            .then(userListData => {
                // ユーザー台帳検索結果ログは削除
                return userListData;
            });
        searchPromises.push(userListPromise);

        // 全ての検索が完了したらデータを統合
        return Promise.all(searchPromises)
            .then(async (results) => {
                // 最後の結果がユーザー台帳データ
                const userListData = results.pop();
                return await this.integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData);
            });
    }

    /**
     * 統合キーから主キーを抽出
     */
    parseIntegrationKey(integrationKey) {
        if (!integrationKey || typeof integrationKey !== 'string') {
            return { PC: null, EXT: null, SEAT: null };
        }

        const result = { PC: null, EXT: null, SEAT: null };
        
        // PC:値|EXT:値|SEAT:値 の形式をパース
        const parts = integrationKey.split('|');
        
        parts.forEach(part => {
            const [key, value] = part.split(':');
            if (key && value && value.trim() !== '') {
                result[key] = value;
            }
        });

        return result;
    }

    /**
     * 統合キーから抽出した主キーで各台帳を検索（全主キーフィールドをOR条件で検索）
     */
    async searchByPrimaryKeys(appId, integrationKeys) {
        const appConfig = CONFIG.apps[appId];
        if (!appConfig) return [];

        const ledgerName = appConfig.name;
        
        // 統合キーから全ての主キー値を抽出
        const pcValues = new Set();
        const extValues = new Set();
        const seatValues = new Set();

        integrationKeys.forEach(integrationKey => {
            const parsed = this.parseIntegrationKey(integrationKey);
            
            if (parsed.PC) {
                pcValues.add(parsed.PC);
            }
            if (parsed.EXT) {
                extValues.add(parsed.EXT);
            }
            if (parsed.SEAT) {
                seatValues.add(parsed.SEAT);
            }
        });

        // OR条件クエリを構築
        const queryParts = [];
        
        if (pcValues.size > 0) {
            const pcList = Array.from(pcValues).map(value => `"${value}"`).join(',');
            queryParts.push(`PC番号 in (${pcList})`);
        }
        
        if (extValues.size > 0) {
            const extList = Array.from(extValues).map(value => `"${value}"`).join(',');
            queryParts.push(`内線番号 in (${extList})`);
        }
        
        if (seatValues.size > 0) {
            const seatList = Array.from(seatValues).map(value => `"${value}"`).join(',');
            queryParts.push(`座席番号 in (${seatList})`);
        }

        if (queryParts.length === 0) {
            return [];
        }

        // OR条件で結合
        const query = queryParts.join(' or ');
        
        return window.searchEngine.searchRecordsWithQuery(appId, query);
    }

    /**
     * 2つの検索結果をマージ（重複除去）
     */
    mergeSearchResults(existingRecords, newRecords) {
        if (!existingRecords || existingRecords.length === 0) {
            return newRecords || [];
        }
        
        if (!newRecords || newRecords.length === 0) {
            return existingRecords;
        }

        // 既存レコードのIDセットを作成
        const existingIds = new Set();
        existingRecords.forEach(record => {
            const recordId = record['$id'] && record['$id'].value !== undefined 
                ? record['$id'].value 
                : record['$id'];
            if (recordId) {
                existingIds.add(recordId);
            }
        });

        // 新しいレコードから重複していないものを追加
        const mergedRecords = [...existingRecords];
        newRecords.forEach(record => {
            const recordId = record['$id'] && record['$id'].value !== undefined 
                ? record['$id'].value 
                : record['$id'];
            
            if (recordId && !existingIds.has(recordId)) {
                mergedRecords.push(record);
                existingIds.add(recordId);
            }
        });

        return mergedRecords;
    }

    /**
     * レコードから統合キーを抽出
     */
    extractIntegrationKeys(records) {
        const integrationKeys = new Set();
        
        records.forEach(record => {
            const keyField = record[CONFIG.integrationKey];
            if (keyField && keyField.value) {
                integrationKeys.add(keyField.value);
            }
        });

        return Array.from(integrationKeys);
    }

    /**
     * 統合キーを使って特定の台帳を検索
     */
    searchByIntegrationKeys(appId, integrationKeys) {
        // IN演算子で統合キーの配列を検索
        const keyList = integrationKeys.map(key => `"${key}"`).join(',');
        const query = `${CONFIG.integrationKey} in (${keyList})`;
        
        return window.searchEngine.searchRecordsWithQuery(appId, query);
    }

    /**
     * 全台帳からBSSIDを抽出してユーザー台帳を検索
     */
    searchUserListByUserIds(allLedgerData) {
        const userIds = new Set();
        const userIdFieldName = CONFIG.userList.primaryKey;
        // PC台帳のappIdを取得
        const pcAppId = Object.keys(CONFIG.apps).find(appId => CONFIG.apps[appId].name === 'PC台帳');
        const pcRecords = allLedgerData[pcAppId] || [];
        pcRecords.forEach(record => {
            const userIdField = record[userIdFieldName];
            if (userIdField && userIdField.value) {
                userIds.add(userIdField.value);
            }
        });
        if (userIds.size === 0) {
            return Promise.resolve([]);
        }
        const userIdList = Array.from(userIds).map(id => `"${id}"`).join(',');
        const query = `${userIdFieldName} in (${userIdList})`;
        return window.searchEngine.searchRecordsWithQuery(CONFIG.userList.appId, query);
    }

    /**
     * 全台帳のデータを統合し、ユーザー台帳から氏名漢字を取得
     * 統合キーでの一致に関係なく、全ての検索結果を表示
     */
    async integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData) {
        const integratedData = [];

        // ユーザー台帳をBSSIDでマップ化（CONFIG.jsから取得）
        const userIdFieldName = CONFIG.userList.primaryKey;
        //const userNameFieldName = CONFIG.fieldMappings.userName;
        const userListMapFields = CONFIG.userList.mapFields || [];
        const userMaps = {};
        userListMapFields.forEach(fieldName => {
            userMaps[fieldName] = new Map();
        });
        userListData.forEach(user => {
            const userId = user[userIdFieldName] && user[userIdFieldName].value;
            if (userId) {
                userListMapFields.forEach(fieldName => {
                    const value = user[fieldName] && user[fieldName].value;
                    userMaps[fieldName].set(userId, value || '');
                });
            }
        });

        // 全台帳の全レコードから統合キーを収集
        const allIntegrationKeys = new Set();
        
        // 起点台帳の統合キー
        integrationKeys.forEach(key => allIntegrationKeys.add(key));
        
        // 他台帳の統合キーも収集
        Object.values(allLedgerData).forEach(records => {
            records.forEach(record => {
                const keyField = record[CONFIG.integrationKey];
                if (keyField && keyField.value) {
                    allIntegrationKeys.add(keyField.value);
                }
            });
        });

        // 統合キーが存在しないレコード用の一意キーを生成
        const recordsWithoutIntegrationKey = [];
        Object.entries(allLedgerData).forEach(([appId, records]) => {
            records.forEach(record => {
                const keyField = record[CONFIG.integrationKey];
                if (!keyField || !keyField.value) {
                    const recordId = record['$id'] && record['$id'].value !== undefined 
                        ? record['$id'].value 
                        : record['$id'];
                    const uniqueKey = `EMPTY_${appId}_${recordId}`;
                    allIntegrationKeys.add(uniqueKey);
                    recordsWithoutIntegrationKey.push({ key: uniqueKey, appId, record });
                }
            });
        });

        console.log(`📊 統合処理対象: ${allIntegrationKeys.size}件 (統合キー有り: ${integrationKeys.length}件, 統合キー無し: ${recordsWithoutIntegrationKey.length}件)`);

        for (const integrationKey of allIntegrationKeys) {
            const integratedRecord = {};
            let recordUserId = null;
            
            for (const [appId, records] of Object.entries(allLedgerData)) {
                const appConfig = CONFIG.apps[appId];
                const ledgerName = appConfig.name;
                const displayFields = CONFIG.getDisplayFields(appId);
                
                let matchingRecord = null;
                
                if (integrationKey.startsWith('EMPTY_')) {
                    // 統合キーが存在しないレコードの場合
                    const emptyRecord = recordsWithoutIntegrationKey.find(item => 
                        item.key === integrationKey && item.appId === appId
                    );
                    if (emptyRecord) {
                        matchingRecord = emptyRecord.record;
                    }
                } else {
                    // 通常の統合キーでの検索
                    matchingRecord = records.find(record => {
                        const keyField = record[CONFIG.integrationKey];
                        return keyField && keyField.value === integrationKey;
                    });
                }
                
                if (matchingRecord) {
                    // レコードが存在する場合、displayFieldsで指定されたフィールドを追加
                    displayFields.forEach(fieldCode => {
                        const fieldValue = matchingRecord[fieldCode];
                        const displayValue = fieldValue && fieldValue.value !== undefined 
                            ? fieldValue.value 
                            : fieldValue;
                        
                        integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                        
                        // BSSIDを記録（CONFIG.jsから取得）
                        if (fieldCode === userIdFieldName && displayValue) {
                            recordUserId = displayValue;
                        }
                    });
                    
                    // レコードIDを追加（保存処理で使用するため）
                    const recordIdField = matchingRecord['$id'];
                    const recordIdValue = recordIdField && recordIdField.value !== undefined 
                        ? recordIdField.value 
                        : recordIdField;
                    integratedRecord[`${ledgerName}_$id`] = recordIdValue;
                    
                    // 統合キーも追加（マージ処理で使用するため）
                    const integrationKeyField = matchingRecord[CONFIG.integrationKey];
                    const integrationKeyValue = integrationKeyField && integrationKeyField.value !== undefined 
                        ? integrationKeyField.value 
                        : integrationKeyField;
                    integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`] = integrationKeyValue || integrationKey;
                } else {
                    // レコードが存在しない場合、displayFieldsのフィールドをnullで埋める
                    displayFields.forEach(fieldCode => {
                        integratedRecord[`${ledgerName}_${fieldCode}`] = null;
                    });
                    
                    // レコードIDもnullで追加
                    integratedRecord[`${ledgerName}_$id`] = null;
                    
                    // 統合キーもnullで追加（EMPTY_の場合は統合キー自体もnull）
                    integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`] = integrationKey.startsWith('EMPTY_') ? null : null;
                }
            }

            // ユーザー台帳から氏名漢字等を取得してPC台帳のデータとして動的に設定
            const pcLedgerName = CONFIG.integratedTableConfig.columns.find(c => c.fieldCode === 'PC番号' && c.primaryKey).ledger;
            if (recordUserId) {
                CONFIG.userList.mapFields.forEach(fieldName => {
                    if (userMaps[fieldName] && userMaps[fieldName].has(recordUserId)) {
                        integratedRecord[`${pcLedgerName}_${fieldName}`] = userMaps[fieldName].get(recordUserId);
                    } else {
                        integratedRecord[`${pcLedgerName}_${fieldName}`] = null;
                    }
                });
            }

            integratedData.push(integratedRecord);
        }

        return integratedData;
    }

    /**
     * 2つの統合データをマージ（重複を除外）
     * 統合キーが同じレコードは重複とみなし、新しいデータを優先
     */
    mergeIntegratedData(existingData, newData) {
        if (!existingData || existingData.length === 0) {
            return newData;
        }
        
        if (!newData || newData.length === 0) {
            return existingData;
        }

        // 既存データの統合キーをセットで管理（高速検索のため）
        const existingKeys = new Set();
        const mergedData = [...existingData];

        // 既存データから統合キーを抽出
        existingData.forEach(record => {
            // 統合キーを各台帳のフィールドから探す
            const integrationKey = this.extractIntegrationKeyFromRecord(record);
            if (integrationKey) {
                existingKeys.add(integrationKey);
            }
        });

        // 新しいデータから重複していないものを追加
        newData.forEach(record => {
            const integrationKey = this.extractIntegrationKeyFromRecord(record);
            
            if (integrationKey) {
                // 統合キーが存在する場合の重複チェック
                if (!existingKeys.has(integrationKey)) {
                    mergedData.push(record);
                    existingKeys.add(integrationKey);
                } else {
                    console.log(`❌ 重複レコード除外: 統合キー=${integrationKey}`);
                }
            } else {
                // 統合キーがnullの場合は、とりあえず追加
                mergedData.push(record);
            }
        });
        
        return mergedData;
    }

    /**
     * 統合レコードから統合キーを抽出
     * 各台帳のフィールドから統合キーに対応する値を探す
     */
    extractIntegrationKeyFromRecord(record) {
        // 各台帳から統合キーを探す
        for (const [appId, appConfig] of Object.entries(CONFIG.apps)) {
            const ledgerName = appConfig.name;
            const keyFieldName = `${ledgerName}_${CONFIG.integrationKey}`;
            
            if (record[keyFieldName] && record[keyFieldName] !== null) {
                return record[keyFieldName];
            }
        }
        
        return null;
    }
}

// グローバルに公開
window.DataIntegrator = DataIntegrator; 