/**
 * @file AcclimatizationOfANRRuleParam.cpp
 */

#include <sstream>
#include <map>
#include "../constant/Constants.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "AcclimatizationOfANRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void AcclimatizationOfANRRuleParam::ParseParam(const std::string& paramString) {
    // single-table style: "MIN LN,ACC STATE CURRENT TZ,ACC STATE PREV TZ,SEVERITY"
    // Keep backward compatibility with the older "MIN LN,SEVERITY" shape.
    // keep compatibility with existing loaders: ',' separated fields
    std::stringstream ss(paramString);
    vector<string> fields;
    string cell;
    while (std::getline(ss, cell, ',')) {
        fields.push_back(trim(cell));
    }
    if (!fields.empty()) {
        // Expect first value is MIN LN if present
        if (!fields[0].empty() && fields[0] != RuleParamConstant::IGNORED) {
            _minLocalNights = atoi(fields[0].c_str());
        }
        if (fields.size() >= 3) {
            if (!fields[1].empty() && fields[1] != RuleParamConstant::IGNORED) {
                _accStateCurrentTz = fields[1];
            }
            if (!fields[2].empty() && fields[2] != RuleParamConstant::IGNORED) {
                _accStatePrevTz = fields[2];
            }
        }
        // Optional: severity as the last column in both old and new shapes.
        if ((fields.size() == 2 || fields.size() >= 4) && !fields.back().empty()) {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(fields.back().c_str())));
        }
    }
}

void AcclimatizationOfANRRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
        const string& header = iter->first;
        const string& value = iter->second;
        if (header == "MIN LN") {
            if (!value.empty() && value != RuleParamConstant::IGNORED) {
                _minLocalNights = atoi(value.c_str());
            }
        }
        else if (header == "ACC STATE CURRENT TZ") {
            if (!value.empty() && value != RuleParamConstant::IGNORED) {
                _accStateCurrentTz = value;
            }
        }
        else if (header == "ACC STATE PREV TZ") {
            if (!value.empty() && value != RuleParamConstant::IGNORED) {
                _accStatePrevTz = value;
            }
        }
        else if (header == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        }
        else {
            Logger::getRuleLogger()->error(
                "Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}",
                dbRule.idRule, dbRule.idRuleParam, header);
        }
    }
}

