/**
 * @file FdpSectorLimitForSQRuleParam.cpp
 */

#include "FdpSectorLimitForSQRuleParam.h"

#include <utility>

#include "spdlog/spdlog.h"
#include "StringUtil.h"
#include "../framework/constant/Constants.h"
#include "../framework/utils/TimeUtils.h"

using namespace std;

namespace {
constexpr int kDefaultMaxSectors = std::numeric_limits<int>::max();
}

void FdpSectorLimitForSQRuleParam::ParseParam(const std::string& paramString) {
    this->SetId(RuleFuncId);
    this->SetRuleParamId(0);
    this->SetPhase(0);

    vector<string> tokens;
    split(paramString, tokens, ",");
    const auto getToken = [&](size_t index) -> std::string {
        if (index >= tokens.size()) {
            return "";
        }
        return trim(tokens[index]);
    };

    applyHeaderValue("COMPOSITION", getToken(0));
    applyHeaderValue("FDP LOWER", getToken(1));
    applyHeaderValue("FDP UPPER", getToken(2));
    applyHeaderValue("MAX SECTORS", getToken(3));
    if (tokens.size() > 4) {
        applyHeaderValue("SEVERITY", getToken(4));
    }
}

void FdpSectorLimitForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    _rowNum = dbRule.rowNum;

    for (const auto& kv : dbRule.params) {
        const std::string headerUpper = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);
        applyHeaderValue(headerUpper, value);
    }
    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }
}

bool FdpSectorLimitForSQRuleParam::Matches(const Duty* duty, const std::string& compositionUpper,
                                           int fdpMinutes) const {
    if (fdpMinutes < _fdpLowerMinutes || fdpMinutes > _fdpUpperMinutes) {
        return false;
    }
    if (!_compositionsUpper.empty()) {
        if (compositionUpper.empty() ||
            std::find(_compositionsUpper.cbegin(),
                      _compositionsUpper.cend(),
                      compositionUpper) == _compositionsUpper.cend()) {
            return false;
        }
    }

    if (!MatcheSectorBLH(duty)) {
        return false;
    }

    return true;
}

bool FdpSectorLimitForSQRuleParam::MatcheSectorBLH(const Duty* duty) const {
    bool matched = false;
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        int blkMinutes = static_cast<int>(seg->getBlkMinutes());
        if (blkMinutes >= _sectorBlhLowerMinutes && blkMinutes <= _sectorBlhUpperMinutes) {
            matched = true;
            break;
        }
    }
    return matched;
}

void FdpSectorLimitForSQRuleParam::parseListValue(const std::string& value,
                                                  std::vector<std::string>& target,
                                                  std::string& label) {
    std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == RuleParamConstant::ALL) {
        target.clear();
        label = RuleParamConstant::ALL;
        return;
    }
    label = trimmed;
    vector<string> tokens;
    split(trimmed.c_str(), '|', tokens);
    target.clear();
    target.reserve(tokens.size());
    for (auto& token : tokens) {
        std::string normalized = normalizeToken(token);
        if (!normalized.empty() && normalized != RuleParamConstant::ALL) {
            target.emplace_back(std::move(normalized));
        }
    }
}

int FdpSectorLimitForSQRuleParam::parseDurationValue(const std::string& text, int defaultValue) {
    std::string trimmed = trim(text);
    if (trimmed.empty() || trimmed == RuleParamConstant::ALL) {
        return defaultValue;
    }
    const int minutes = TimeUtils::hhmmToMinutes(trimmed);
    if (minutes < 0) {
        spdlog::warn("Failed to parse FDP duration [{}] for rule {}", trimmed, RuleFuncId);
        return defaultValue;
    }
    return minutes;
}

int FdpSectorLimitForSQRuleParam::parseIntValue(const std::string& text, int defaultValue) {
    std::string trimmed = trim(text);
    if (trimmed.empty() || trimmed == RuleParamConstant::ALL) {
        return defaultValue;
    }
    try {
        return std::max(0, std::stoi(trimmed));
    } catch (...) {
        spdlog::warn("Failed to parse integer [{}] for rule {}", trimmed, RuleFuncId);
        return defaultValue;
    }
}

std::string FdpSectorLimitForSQRuleParam::normalizeToken(const std::string& token) {
    return strToUpper(trim(token));
}

void FdpSectorLimitForSQRuleParam::applyHeaderValue(const std::string& headerUpper,
                                                    const std::string& value) {
    if (headerUpper == "COMPOSITION" || headerUpper == "COMPOSITIONS") {
        parseListValue(value, _compositionsUpper, _compositionLabel);
    } else if (headerUpper == "FDP LOWER" || headerUpper == "FDP START") {
        _fdpLowerMinutes = parseDurationValue(value, _fdpLowerMinutes);
    } else if (headerUpper == "FDP UPPER" || headerUpper == "FDP END") {
        _fdpUpperMinutes = parseDurationValue(value, _fdpUpperMinutes);
    } else if (headerUpper == "SECTOR BLH LOWER" || headerUpper == "SECTOR BLH START") {
        _sectorBlhLowerMinutes = parseDurationValue(value, _sectorBlhLowerMinutes);
    } else if (headerUpper == "SECTOR BLH UPPER" || headerUpper == "SECTOR BLH END") {
        _sectorBlhUpperMinutes = parseDurationValue(value, _sectorBlhUpperMinutes);
    } else if (headerUpper == "MAX SECTORS" || headerUpper == "MAX SECTOR") {
        _maxSectors = parseIntValue(value, kDefaultMaxSectors);
    } else if (headerUpper == "SEVERITY") {
        if (!value.empty()) {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        }
    } else if (!headerUpper.empty()) {
        spdlog::debug("Unhandled header [{}] for CA FDP sector limit rule {}", headerUpper, RuleFuncId);
    }
}
