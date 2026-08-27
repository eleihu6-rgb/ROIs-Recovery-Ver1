/**
 * @file AtdoAfterSlipForSQRuleParam.cpp
 */

#include "AtdoAfterSlipForSQRuleParam.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <limits>
#include <sstream>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"

namespace {

bool isAllToken(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

bool tryParseIntegerToken(const std::string& token, long long& outValue) {
    if (token.empty()) {
        return false;
    }
    if (!std::all_of(token.begin(),
                     token.end(),
                     [](unsigned char c) { return std::isdigit(c) != 0; })) {
        return false;
    }
    outValue = std::atoll(token.c_str());
    return true;
}

}  // namespace

std::string AtdoAfterSlipForSQRuleParam::NormalizeUpper(const std::string& value) {
    return strToUpper(trim(value));
}

int AtdoAfterSlipForSQRuleParam::ParseIntOrDefault(const std::string& value, int defaultValue) {
    const std::string t = trim(value);
    if (t.empty()) {
        return defaultValue;
    }
    return atoi(t.c_str());
}

int AtdoAfterSlipForSQRuleParam::ParseTimeMinutes(const std::string& value) {
    const std::string t = trim(value);
    if (t.empty() || t == "*" || t == RuleParamConstant::IGNORED || t == RuleParamConstant::IGNORED_2) {
        return 0;
    }
    int hh = 0;
    int mm = 0;
    char sep = '\0';
    std::istringstream iss(t);
    iss >> hh >> sep >> mm;
    if (!iss || sep != ':' || hh < 0 || hh > 99 || mm < 0 || mm > 59) {
        return 0;
    }
    return hh * 60 + mm;
}

std::vector<std::string> AtdoAfterSlipForSQRuleParam::SplitDashOutsideParen(const std::string& value) {
    std::vector<std::string> out;
    std::string cur;
    int depth = 0;
    for (char ch : value) {
        if (ch == '(') {
            ++depth;
            cur.push_back(ch);
            continue;
        }
        if (ch == ')') {
            if (depth > 0) {
                --depth;
            }
            cur.push_back(ch);
            continue;
        }
        if (ch == '-' && depth == 0) {
            const std::string token = trim(cur);
            if (!token.empty()) {
                out.push_back(token);
            }
            cur.clear();
            continue;
        }
        cur.push_back(ch);
    }
    const std::string tail = trim(cur);
    if (!tail.empty()) {
        out.push_back(tail);
    }
    return out;
}

Atdo7422SectorRequirement AtdoAfterSlipForSQRuleParam::ParseSectorRequirement(const std::string& valueUpper) {
    long long numeric = 0;
    if (tryParseIntegerToken(valueUpper, numeric)) {
        return numeric == 0 ? Atdo7422SectorRequirement::NonOperate
                            : Atdo7422SectorRequirement::Operate;
    }
    if (isAllToken(valueUpper)) {
        return Atdo7422SectorRequirement::Any;
    }
    if (valueUpper == "Y" || valueUpper == "YES" || valueUpper == "TRUE" || valueUpper == "T" || valueUpper == "1") {
        return Atdo7422SectorRequirement::Operate;
    }
    if (valueUpper == "N" || valueUpper == "NO" || valueUpper == "FALSE" || valueUpper == "F" || valueUpper == "0") {
        return Atdo7422SectorRequirement::NonOperate;
    }
    if (valueUpper == "OPERATE" || valueUpper == "OP" || valueUpper == "OPERATING") {
        return Atdo7422SectorRequirement::Operate;
    }
    if (valueUpper == "NONOPERATE" || valueUpper == "NON-OPERATE" || valueUpper == "NON_OPERATE" ||
        valueUpper == "POSITION" || valueUpper == "POS" || valueUpper == "DHD" || valueUpper == "DEADHEAD") {
        return Atdo7422SectorRequirement::NonOperate;
    }
    return Atdo7422SectorRequirement::Any;
}

void AtdoAfterSlipForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);

    _clause.clear();
    _patternRaw.clear();
    _patternStationChainRaw.clear();
    _patternStationChain.clear();
    _slipStationRaw.clear();
    _slipStationExpr = Atdo7422LocationExpr{};

    _slipLtHours = 0;
    _slipArrIsOperatingRequirement = Atdo7422SectorRequirement::Operate;
    _slipDepIsOperatingRequirement = Atdo7422SectorRequirement::Operate;
    _maxPairingDays = 0;
    _atdoDays = 0;
    _atdoHours = 0;
    _atdoLocalNights = 0;
    _followingDoAllowAfterMinutes = 0;

    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = NormalizeUpper(it->first);
        const std::string value = trim(it->second);

        if (headerUpper == "CLAUSE") {
            _clause = value;
        } else if (headerUpper == "PATTERN") {
            _patternRaw = value;
            _patternStationChainRaw = SplitDashOutsideParen(value);
            _patternStationChain.clear();
            _patternStationChain.reserve(_patternStationChainRaw.size());
            for (const auto& tokenRaw : _patternStationChainRaw) {
                _patternStationChain.push_back(Atdo7422LocationExpr::Parse(tokenRaw));
            }
        } else if (headerUpper == "SLIP STATION") {
            _slipStationRaw = value;
            _slipStationExpr = Atdo7422LocationExpr::Parse(value);
        } else if (headerUpper == "SLIP < HOURS" || headerUpper == "SLIP LT HOURS" || headerUpper == "SLIP HOURS <") {
            const std::string valueUpper = NormalizeUpper(value);
            if (isAllToken(valueUpper)) {
                // Treat wildcard/ignored as "no upper bound" for slip duration.
                // Use a safe large hour value so `hours * 60` does not overflow `int` downstream.
                _slipLtHours = std::numeric_limits<int>::max() / 60;
            } else {
                _slipLtHours = std::max(0, ParseIntOrDefault(value, 0));
            }
        } else if (headerUpper == "SLIP ARR IS OPERATING" || headerUpper == "SLIP ARR OPERATING" ||
                   headerUpper == "OUTBOUND SECTOR") {  // backward compatible
            _slipArrIsOperatingRequirement = ParseSectorRequirement(NormalizeUpper(value));
        } else if (headerUpper == "SLIP DEP IS OPERATING" || headerUpper == "SLIP DEP OPERATING" ||
                   headerUpper == "INBOUND SECTOR") {  // backward compatible
            _slipDepIsOperatingRequirement = ParseSectorRequirement(NormalizeUpper(value));
        } else if (headerUpper == "MAX PAIRING DAYS" || headerUpper == "MAX CREW DAYS" || headerUpper == "MAX DAYS") {
            _maxPairingDays = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "ATDO DAYS") {
            _atdoDays = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "ATDO HOURS" || headerUpper == "ATDO HRS" || headerUpper == "ATDO REST HOURS") {
            _atdoHours = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "ATDO LOCAL NIGHTS" || headerUpper == "ATDO LNS" || headerUpper == "ATDO REST LOCAL NIGHTS") {
            _atdoLocalNights = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "FOLLOWING DO ALLOW AFTER" || headerUpper == "FOLLOWING DO EARLIEST DUTY") {
            _followingDoAllowAfterMinutes = std::max(0, ParseTimeMinutes(value));
        } else {
            Logger::getRuleLogger()->warn("Rule 7422 parameter ignored, header: {}", it->first);
        }
    }

    if (_slipStationRaw.empty() && _patternStationChainRaw.size() >= 2) {
        _slipStationRaw = _patternStationChainRaw[1];
        _slipStationExpr = _patternStationChain[1];
    }
}

bool AtdoAfterSlipForSQRuleParam::IsValid() const {
    if (_patternStationChain.size() < 3) {
        return false;
    }
    if (_slipStationExpr.type == LocationMatchUtils::LocationExpr::Type::Any) {
        return false;
    }
    if (_slipLtHours <= 0) {
        return false;
    }
    if (_atdoDays <= 0 && _atdoHours <= 0 && _atdoLocalNights <= 0) {
        return false;
    }
    if (_followingDoAllowAfterMinutes < 0 || _followingDoAllowAfterMinutes >= 24 * 60) {
        return false;
    }
    return true;
}
