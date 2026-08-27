/**
 * @file RequireSameCityAroundUlrDutyForSQRuleParam.cpp
 */

#include "RequireSameCityAroundUlrDutyForSQRuleParam.h"

#include <algorithm>

#include "StringUtil.h"
#include "../framework/constant/Constants.h"

std::string RequireSameCityAroundUlrDutyForSQRuleParam::NormalizeToken(const std::string& value) {
    return strToUpper(trim(value));
}

bool RequireSameCityAroundUlrDutyForSQRuleParam::IsAllToken(const std::string& valueUpper) {
    return valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::ALL ||
           valueUpper == RuleParamConstant::IGNORED || valueUpper == RuleParamConstant::IGNORED_2;
}

void RequireSameCityAroundUlrDutyForSQRuleParam::ParseListValue(const std::string& value,
                                                                std::vector<std::string>& output) {
    output.clear();
    const std::string normalized = NormalizeToken(value);
    if (IsAllToken(normalized)) {
        return;
    }

    std::vector<std::string> tokens;
    split(trim(value).c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string cleaned = NormalizeToken(token);
        if (!cleaned.empty()) {
            output.push_back(cleaned);
        }
    }
}

bool RequireSameCityAroundUlrDutyForSQRuleParam::IsHeaderRow(const DBRule& dbRule) {
    for (const auto& entry : dbRule.params) {
        const std::string headerUpper = NormalizeToken(entry.first);
        if (headerUpper == "TABLEHEADER" || headerUpper == "TABLE HEADER") {
            return true;
        }
    }
    return false;
}

void RequireSameCityAroundUlrDutyForSQRuleParam::ParseParam(const std::string& paramString) {
    this->SetId(RuleFuncId);
    this->SetRuleParamId(0);
    this->SetPhase(0);

    std::vector<std::string> tokens;
    split(paramString, tokens, ",");

    const std::string baseValue = tokens.size() > 0 ? trim(tokens[0]) : "";
    const std::string fleetGroupValue = tokens.size() > 1 ? trim(tokens[1]) : "";
    const std::string activeValue = tokens.size() > 2 ? trim(tokens[2]) : "";

    ParseListValue(baseValue, _bases);
    _baseLabel = _bases.empty() ? "*" : baseValue;

    ParseListValue(fleetGroupValue, _fleetGroupsUpper);
    _fleetGroupLabel = _fleetGroupsUpper.empty() ? "*" : fleetGroupValue;

    const std::string activeUpper = NormalizeToken(activeValue);
    _active = activeUpper.empty() || activeUpper == RuleParamConstant::YES || activeUpper == "Y" ||
              activeUpper == "*" || activeUpper == RuleParamConstant::ALL;
}

void RequireSameCityAroundUlrDutyForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    _rowNum = dbRule.rowNum;

    if (IsHeaderRow(dbRule)) {
        _active = false;
        return;
    }

    for (const auto& iter : dbRule.params) {
        const std::string headerUpper = NormalizeToken(iter.first);
        const std::string value = trim(iter.second);
        const std::string valueUpper = NormalizeToken(value);

        if (headerUpper == "BASES" || headerUpper == "BASE") {
            ParseListValue(value, _bases);
            _baseLabel = _bases.empty() ? "*" : value;
        } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" ||
                   headerUpper == "FLEET GRP" || headerUpper == "FLEETGRP") {
            ParseListValue(value, _fleetGroupsUpper);
            _fleetGroupLabel = _fleetGroupsUpper.empty() ? "*" : value;
        } else if (headerUpper == "ACTIVE" || headerUpper == "ENABLED" || headerUpper == "IS ACTIVE") {
            _active = IsAllToken(valueUpper) || valueUpper == RuleParamConstant::YES || valueUpper == "Y";
        } else if (headerUpper == "ROW NUM") {
            _rowNum = atoi(value.c_str());
        } else if (headerUpper == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        }
    }

    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }
}

bool RequireSameCityAroundUlrDutyForSQRuleParam::MatchBase(const std::string& base) const {
    if (_bases.empty()) {
        return true;
    }
    const std::string baseUpper = NormalizeToken(base);
    return std::find(_bases.begin(), _bases.end(), baseUpper) != _bases.end();
}

bool RequireSameCityAroundUlrDutyForSQRuleParam::MatchFleetGroupsForPairing(const Pairing* pairing,
                                                                            const CrewDataContext* dbData) const {
    if (_fleetGroupsUpper.empty()) {
        return true;
    }
    if (pairing == nullptr || dbData == nullptr) {
        return false;
    }

    for (const auto* duty : pairing->getDutyVec()) {
        if (duty == nullptr || !duty->isULR()) {
            continue;
        }
        for (const auto* segment : duty->getSegmentsRead()) {
            if (segment == nullptr || !segment->getIsOperating()) {
                continue;
            }
            const auto fleetIter = dbData->fleetMap.find(segment->getFleetCD());
            if (fleetIter == dbData->fleetMap.end()) {
                continue;
            }
            const std::string fleetGroupUpper = NormalizeToken(fleetIter->second.fleetGrp);
            if (std::find(_fleetGroupsUpper.begin(), _fleetGroupsUpper.end(), fleetGroupUpper) !=
                _fleetGroupsUpper.end()) {
                return true;
            }
        }
    }
    return false;
}
