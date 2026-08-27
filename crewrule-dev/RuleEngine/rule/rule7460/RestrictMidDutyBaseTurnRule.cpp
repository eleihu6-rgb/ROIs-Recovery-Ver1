/**
 * @file RestrictMidDutyBaseTurnRule.cpp
 */

#include "../RuleSytem.h"
#include "RestrictMidDutyBaseTurnRule.h"
#include "../utils/RosterUtils.h"
#include "../utils/StringUtils.h"
#include "StringUtil.h"
#include "../constant/Constants.h"
#include <map>
#include <sstream>

namespace {
constexpr const char* kBaseParamName = "base_station";
constexpr const char* kDutyStartParamName = "duty_start_station";
constexpr const char* kDutyEndParamName = "duty_end_station";

bool IsActiveRow(const DBRule& dbRule) {
    auto& params = dbRule.params;
    for (const auto& entry : params) {
        const std::string header = strToUpper(entry.first);
        if (header == "ACTIVE" || header == "IS ACTIVE" || header == "ENABLED") {
            return strToUpper(trim(entry.second)) == RuleParamConstant::YES;
        }
    }
    return true;
}

bool IsActiveRow(const std::string& paramString) {
    std::stringstream ss(paramString);
    std::string column;
    std::vector<std::string> columns;
    while (std::getline(ss, column, ',')) {
        columns.emplace_back(trim(column));
    }
    if (columns.size() < 3) {
        return true;
    }
    return strToUpper(columns[2]) == RuleParamConstant::YES;
}
}

bool RestrictMidDutyBaseTurnRule::CheckRule(const Pairing* pairing) const {
    if (!_isConfigured || pairing == nullptr) {
        return true;
    }
    return CheckPairingCountRule(pairing);
}

bool RestrictMidDutyBaseTurnRule::CheckRule(const Duty* duty) const {
    if (!_isConfigured || duty == nullptr) {
        return true;
    }
    std::vector<Duty*> duties(1, const_cast<Duty*>(duty));
    return CheckDutyRules(duties, true);
}

bool RestrictMidDutyBaseTurnRule::CheckPairingCountRule(const Pairing* pairing) const {
    if (!_isConfigured || pairing == nullptr) {
        return true;
    }

    bool allValid = true;
    for (const auto& param : _restrictionParams) {
        const int totalNumberInPairing = param.GetTotalNumberInPairing();
        if (totalNumberInPairing <= 0) {
            continue;
        }

        int violationCount = 0;
        for (const auto* duty : pairing->getDutyVec()) {
            const Segment* violatingSegment = nullptr;
            std::string baseStation;
            if (!DutyMatchesParamAndViolates(duty, param, violatingSegment, baseStation)) {
                continue;
            }

            ++violationCount;
            if (violationCount <= totalNumberInPairing) {
                continue;
            }

            PrepareRuleViolation(param,
                                 baseStation,
                                 duty->getDepartureStation(),
                                 duty->getArrivalStation());
            ReportPairingCountViolation(duty,
                                        violatingSegment,
                                        baseStation,
                                        duty->getDepartureStation(),
                                        duty->getArrivalStation());
            allValid = false;
            if (this->IsPairingOptimizerModel()) {
                return false;
            }
        }
    }
    return allValid;
}

bool RestrictMidDutyBaseTurnRule::CheckDutyRules(const std::vector<Duty*>& duties, bool reportViolations) const {
    if (!_isConfigured || duties.empty()) {
        return true;
    }
    bool allValid = true;
    for (const auto& param : _restrictionParams) {
        if (param.GetTotalNumberInPairing() > 0) {
            continue;
        }

        for (const auto* duty : duties) {
            const Segment* violatingSegment = nullptr;
            std::string baseStation;
            if (!DutyMatchesParamAndViolates(duty, param, violatingSegment, baseStation)) {
                continue;
            }

            if (reportViolations) {
                PrepareRuleViolation(param,
                                     baseStation,
                                     duty->getDepartureStation(),
                                     duty->getArrivalStation());
                ReportViolation(duty,
                                violatingSegment,
                                baseStation,
                                duty->getDepartureStation(),
                                duty->getArrivalStation());
            }
            allValid = false;
            if (this->IsPairingOptimizerModel()) {
                return false;
            }
        }
    }
    return allValid;
}

bool RestrictMidDutyBaseTurnRule::DutyMatchesParamAndViolates(const Duty* duty,
                                                              const RestrictMidDutyBaseTurnRuleParam& param,
                                                              const Segment*& segment,
                                                              std::string& baseStation) const {
    segment = nullptr;
    baseStation.clear();
    if (duty == nullptr || duty->getNumSegments() <= 1) {
        return false;
    }
    if (!param.Matches(duty->getDepartureStation(), duty->getArrivalStation())) {
        return false;
    }
    return FindMidDutyBaseSegment(*duty, segment, baseStation);
}

bool RestrictMidDutyBaseTurnRule::FindMidDutyBaseSegment(const Duty& duty,
                                                         const Segment*& segmentOut,
                                                         std::string& baseStation) const {
    segmentOut = nullptr;
    baseStation.clear();

    const auto numSegments = duty.getNumSegments();
    if (numSegments <= 1) {
        return false;
    }

    for (std::size_t i = 0; i < numSegments; ++i) {
        const Segment* segment = duty.getSegment(i);
        if (segment == nullptr) {
            continue;
        }
        if (i > 0) {
            const std::string dep = segment->getDepStation();
            if (IsBaseStation(dep)) {
                segmentOut = segment;
                baseStation = dep;
                return true;
            }
        }
        // only need to check departure, arrival is the same as next dep
    }
    return false;
}

void RestrictMidDutyBaseTurnRule::ReportViolation(const Duty* duty,
                                                  const Segment* segment,
                                                  const std::string& baseStation,
                                                  const std::string& dutyStartStation,
                                                  const std::string& dutyEndStation) const {
    if (duty == nullptr || segment == nullptr) {
        return;
    }

    std::string msg = "[Operational] Duty cannot pass through base ({0:station}) when starting at ({1:start}) and ending at ({2:end}).";
    msg = StringUtils::Format(msg, baseStation, dutyStartStation, dutyEndStation);

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = RestrictMidDutyBaseTurnRule::RuleFuncId;
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySegNum();
    rv->segmentId = segment->getSegmentId();
    rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
        if (_dbData != nullptr) {
            const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
            if (crewIndex >= 0 && crewIndex < static_cast<int>(_dbData->crewList.size())) {
                SharedPtr<CREW> crew = _dbData->crewList[crewIndex];
                if (crew != nullptr) {
                    const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(crew->rosterList, duty->getPairingId());
                    rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
                    rv->crewId = crew->idCrew;
                    _ruleViolation.SetLegalityMessage(crew, msg);
                }
            }
        }
    } else {
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, RestrictMidDutyBaseTurnRule::RuleFuncId);
    }

    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->violation_msg = msg;
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("baseStation", baseStation));
    rv->operation_result.insert(std::make_pair("dutyStartStation", dutyStartStation));
    rv->operation_result.insert(std::make_pair("dutyEndStation", dutyEndStation));
    _ruleViolation.AddRuleViolations(rv);
}

void RestrictMidDutyBaseTurnRule::ReportPairingCountViolation(const Duty* duty,
                                                              const Segment* segment,
                                                              const std::string& baseStation,
                                                              const std::string& dutyStartStation,
                                                              const std::string& dutyEndStation) const {
    if (duty == nullptr || segment == nullptr) {
        return;
    }

    std::string msg = "[Operational] Duty cannot pass through base ({0:station}) when starting at ({1:start}) and ending at ({2:end}).";
    msg = StringUtils::Format(msg, baseStation, dutyStartStation, dutyEndStation);

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = RestrictMidDutyBaseTurnRule::RuleFuncId;
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySegNum();
    rv->segmentId = segment->getSegmentId();
    rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
        if (_dbData != nullptr) {
            const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
            if (crewIndex >= 0 && crewIndex < static_cast<int>(_dbData->crewList.size())) {
                SharedPtr<CREW> crew = _dbData->crewList[crewIndex];
                if (crew != nullptr) {
                    const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(crew->rosterList, duty->getPairingId());
                    rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
                    rv->crewId = crew->idCrew;
                    _ruleViolation.SetLegalityMessage(crew, msg);
                }
            }
        }
    }

    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->violation_msg = msg;
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("baseStation", baseStation));
    rv->operation_result.insert(std::make_pair("dutyStartStation", dutyStartStation));
    rv->operation_result.insert(std::make_pair("dutyEndStation", dutyEndStation));
    _ruleViolation.AddRuleViolations(rv);
}

void RestrictMidDutyBaseTurnRule::PrepareRuleViolation(const RestrictMidDutyBaseTurnRuleParam& matchedParam,
                                                       const std::string& baseStation,
                                                       const std::string& dutyStartStation,
                                                       const std::string& dutyEndStation) const {
    _ruleViolation.SetRuleParam(matchedParam);
    _ruleViolation.SetParam(kBaseParamName, baseStation);
    _ruleViolation.SetParam(kDutyStartParamName, dutyStartStation);
    _ruleViolation.SetParam(kDutyEndParamName, dutyEndStation);
}

bool RestrictMidDutyBaseTurnRule::IsBaseStation(const std::string& value) const {
    if (!_dbData) {
        return false;
    }
    for (const auto& base : _dbData->baseList) {
        if (value == base.base) {
            return true;
        }
    }
    return false;
}

void RestrictMidDutyBaseTurnRule::ParseParam(const InputType& input) {
    _restrictionParams.clear();
    _isConfigured = true;

    for (const auto& dbRule : input.dbRules) {
        if (!IsActiveRow(dbRule)) {
            continue;
        }
        _restrictionParams.emplace_back(this);
        _restrictionParams.back().ParseParam(dbRule);
    }
    if (_restrictionParams.empty()) {
        for (const auto& paramString : input.ruleParamString) {
            if (!IsActiveRow(paramString)) {
                continue;
            }
            _restrictionParams.emplace_back(this);
            _restrictionParams.back().ParseParam(paramString);
        }
    }
}
