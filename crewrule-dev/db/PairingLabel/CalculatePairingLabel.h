#pragma once

#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>
#include "UtilFunc.h"

#include "../CrewDB.h"

struct PairingLabelFieldValue {
    //当前value值
    std::string value;
    
    //候选value值（用于标签冲突检查）
    vector<string> candidateValues;
};

struct PairingLabelFieldDef {

    std::string fieldName;
    
    std::function<PairingLabelFieldValue(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData)> calculate;
};

class PairingLabel {
public:

    const static char separator;

    PairingLabel(Pairing* pairing) : _pairing(pairing) {}

    void setFieldDefs(const vector<std::shared_ptr<PairingLabelFieldDef>>& fieldDefs) {
        _fieldDefs = fieldDefs;
    }

    const vector<std::shared_ptr<PairingLabelFieldDef>>& getFieldDefs() const {
        return _fieldDefs;
    }

    void calculate(const int offsetTZMinutes, const CrewDataContext* dbData) {
        _fieldValues.clear();
        for (const auto& fieldDef : _fieldDefs) {
            PairingLabelFieldValue fieldValue = fieldDef->calculate(_pairing, offsetTZMinutes, dbData);
            _fieldValues.push_back(fieldValue);
        }
    }

    string getLabel() const {
        string label;
        for (std::size_t i = 0; i < _fieldValues.size(); i++) {
            if (i > 0) {
                label += separator;
            }
            label += _fieldValues[i].value;
        }
        return label;
    }

    //获得候选标签值（用于检查标签冲突）
    std::vector<std::string> getAllCandidateLabel() const {
        std::vector<std::string> allCandidates;

        if (_fieldValues.empty()) {
            return allCandidates;
        }

        // 步骤1：初始化第一个字段的候选集（候选值 + 当前值，去重）
        std::vector<std::string> tempCandidates = getFieldAllValues(_fieldValues[0]);

        // 步骤2：遍历剩余字段，拼接所有组合（每个字段都包含当前值+候选值）
        for (std::size_t i = 1; i < _fieldValues.size(); i++) {
            // 获取当前字段的完整候选集（候选值 + 当前值）
            std::vector<std::string> fieldAllValues = getFieldAllValues(_fieldValues[i]);
            std::vector<std::string> newTemp;
            // 预分配内存提升性能
            newTemp.reserve(tempCandidates.size() * fieldAllValues.size());

            // 拼接：已有组合 + 当前字段的所有值（候选+当前）
            for (const auto& existing : tempCandidates) {
                for (const auto& val : fieldAllValues) {
                    string label = existing + std::string(1, separator) + val;
                    newTemp.emplace_back(label);
                }
            }

            tempCandidates.swap(newTemp);
        }

        //// 步骤3：去重 + 排序（保证结果有序）
        //if (!tempCandidates.empty()) {
        //    std::sort(tempCandidates.begin(), tempCandidates.end());
        //    auto last = std::unique(tempCandidates.begin(), tempCandidates.end());
        //    tempCandidates.erase(last, tempCandidates.end());
        //}

        allCandidates = std::move(tempCandidates);
        return allCandidates;
    }

    // 按照 separator 拆分标签字符串为字段值数组
    static std::vector<std::string> splitLabel(const std::string& label) {
        vector<string> results;
        split(label.c_str(), separator, results);
        return results;
    }

private:
    Pairing* _pairing = nullptr;

    vector<std::shared_ptr<PairingLabelFieldDef>> _fieldDefs;

    vector<PairingLabelFieldValue> _fieldValues;
    
    inline std::vector<std::string> getFieldAllValues(const PairingLabelFieldValue& field) const {
        std::vector<std::string> allValues;
        allValues.push_back(field.value); //候选值中包含当前值
        allValues.insert(allValues.end(), field.candidateValues.begin(), field.candidateValues.end());
        return allValues;
    }
};


class CalculatePairingLabel {
 public:

     CalculatePairingLabel(const vector<std::shared_ptr<PairingLabelFieldDef>> fieldDefs, CrewDataContext* dbData) : _fieldDefs(fieldDefs), _dbData(dbData) {}

    virtual void calculate(Pairing* pairing, const int offsetTZMinutes);

    virtual void calculate(vector<Pairing*> pairingList, const int offsetTZMinutes);
    
    virtual bool equalsLabel(const string& oldPairingLabel, const std::shared_ptr<PairingLabel>& pairingLabel) const {
        if (oldPairingLabel == pairingLabel->getLabel()) {
            return true;
        }

        auto newLabelList = pairingLabel->getAllCandidateLabel();
        newLabelList.emplace_back(pairingLabel->getLabel());

        //与newLabelList中任何一个相等即可
        for (auto& newLabel : newLabelList) {
            if (oldPairingLabel == newLabel) {
                return true;
            }
        }
        return false;
    }

protected:
    CrewDataContext* _dbData;

    vector<std::shared_ptr<PairingLabelFieldDef>> _fieldDefs;
};