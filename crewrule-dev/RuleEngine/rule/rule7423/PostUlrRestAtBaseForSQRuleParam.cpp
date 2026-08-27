/**
 * @file PostUlrRestAtBaseForSQRuleParam.cpp
 */

#include "PostUlrRestAtBaseForSQRuleParam.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <sstream>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"

namespace {

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

std::string PostUlrRestAtBaseForSQRuleParam::NormalizeUpper(const std::string& value) {
    return strToUpper(trim(value));
}

PostUlr7423YesNoAny PostUlrRestAtBaseForSQRuleParam::ParseYesNoAny(const std::string& value) {
    const std::string t = NormalizeUpper(value);
    if (t.empty() || t == "*" || t == RuleParamConstant::IGNORED) {
        return PostUlr7423YesNoAny::Any;
    }
    long long numeric = 0;
    if (tryParseIntegerToken(t, numeric)) {
        return numeric == 0 ? PostUlr7423YesNoAny::No : PostUlr7423YesNoAny::Yes;
    }
    if (t == "Y" || t == "YES" || t == "TRUE" || t == "1") {
        return PostUlr7423YesNoAny::Yes;
    }
    if (t == "N" || t == "NO" || t == "FALSE" || t == "0") {
        return PostUlr7423YesNoAny::No;
    }
    return PostUlr7423YesNoAny::Any;
}

int PostUlrRestAtBaseForSQRuleParam::ParseIntOrDefault(const std::string& value, int defaultValue) {
    const std::string t = trim(value);
    if (t.empty()) {
        return defaultValue;
    }
    return atoi(t.c_str());
}

int PostUlrRestAtBaseForSQRuleParam::ParseTimeMinutes(const std::string& value) {
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

void PostUlrRestAtBaseForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);

    _clause.clear();
    _hasUlrDuty = PostUlr7423YesNoAny::Yes;
    _postUlrPositionBackToBase = PostUlr7423YesNoAny::Any;
    _restDays = 0;
    _restHours = 0;
    _restLocalNights = 0;
    _followingDoAllowAfterMinutes = 0;

    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = NormalizeUpper(it->first);
        const std::string value = trim(it->second);

        if (headerUpper == "CLAUSE") {
            _clause = value;
        } else if (headerUpper == "HAS ULR DUTY") {
            _hasUlrDuty = ParseYesNoAny(value);
        } else if (headerUpper == "POST ULR POSITION BACK TO BASE") {
            _postUlrPositionBackToBase = ParseYesNoAny(value);
        } else if (headerUpper == "REST DAYS" || headerUpper == "ATDO DAYS") {
            _restDays = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "REST HOURS" || headerUpper == "ATDO HOURS" || headerUpper == "ATDO HRS") {
            _restHours = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "REST LOCAL NIGHTS" || headerUpper == "ATDO LOCAL NIGHTS" || headerUpper == "ATDO LNS") {
            _restLocalNights = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "FOLLOWING DO ALLOW AFTER" || headerUpper == "FOLLOWING DO EARLIEST DUTY") {
            _followingDoAllowAfterMinutes = std::max(0, ParseTimeMinutes(value));
        } else {
            Logger::getRuleLogger()->warn("Rule 7423 parameter ignored, header: {}", it->first);
        }
    }
}

bool PostUlrRestAtBaseForSQRuleParam::Matches(bool hasUlrDuty, bool hasPositionBackAfterUlr) const {
    const auto match = [](PostUlr7423YesNoAny p, bool actual) -> bool {
        if (p == PostUlr7423YesNoAny::Any) {
            return true;
        }
        return (p == PostUlr7423YesNoAny::Yes) == actual;
    };

    return match(_hasUlrDuty, hasUlrDuty) && match(_postUlrPositionBackToBase, hasPositionBackAfterUlr);
}

int PostUlrRestAtBaseForSQRuleParam::Specificity() const {
    int s = 0;
    if (_hasUlrDuty != PostUlr7423YesNoAny::Any) {
        ++s;
    }
    if (_postUlrPositionBackToBase != PostUlr7423YesNoAny::Any) {
        ++s;
    }
    return s;
}

bool PostUlrRestAtBaseForSQRuleParam::IsValid() const {
    if (_restDays <= 0 && _restHours <= 0 && _restLocalNights <= 0) {
        return false;
    }
    if (_followingDoAllowAfterMinutes < 0 || _followingDoAllowAfterMinutes >= 24 * 60) {
        return false;
    }
    return true;
}

