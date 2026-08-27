#include "CheckAnrReportingDebriefRule.h"

#include <algorithm>

#include "CrewDB.h"
#include "StringUtil.h"
#include "../utils/TimeUtils.h"

namespace {
bool isFlyOrDhdAssignment(const std::string& assignment) {
    return assignment == "FLY" || assignment == "DHD";
}

bool hasFlyOrDhdSegment(const Duty* duty) {
    for (const auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        if (isFlyOrDhdAssignment(seg->getAssignment())) {
            return true;
        }
    }
    return false;
}

std::string getPairingDivisionUpper(const Duty* duty,
                                    const SharedPtr<CrewDataContext>& dbData) {
    if (dbData == nullptr) {
        return "";
    }

    std::string pairingDivision = dbData->scenario.division;
    if (!pairingDivision.empty()) {
        return strToUpper(trim(pairingDivision));
    }
    if (duty == nullptr) {
        return "";
    }

    const auto itPairing = dbData->pairingIdMap.find(duty->getPairingId());
    if (itPairing != dbData->pairingIdMap.end() && itPairing->second != nullptr) {
        return strToUpper(trim(itPairing->second->getDivision()));
    }
    return "";
}

int getBriefMinutes(const Duty* duty) {
    if (duty == nullptr) {
        return 0;
    }
    long brief = duty->getActualBriefMin();
    if (brief <= 0) {
        brief = duty->getMinBrief();
    }
    return brief < 0 ? 0 : static_cast<int>(brief);
}

int getDebriefMinutes(const Duty* duty) {
    if (duty == nullptr) {
        return 0;
    }
    long debrief = duty->getActualDebriefMin();
    if (debrief <= 0) {
        debrief = duty->getMinDebrief();
    }
    return debrief < 0 ? 0 : static_cast<int>(debrief);
}

bool matches3021BriefRule(const Duty* duty,
                          const Segment* seg,
                          const rule3021& cache,
                          const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr || seg == nullptr) {
        return false;
    }

    const std::string pairingDivisionUpper = getPairingDivisionUpper(duty, dbData);
    const std::string cacheDivisionUpper = strToUpper(trim(cache.division));
    if (!cacheDivisionUpper.empty() && cacheDivisionUpper != "*" &&
        !pairingDivisionUpper.empty() && cacheDivisionUpper != pairingDivisionUpper) {
        return false;
    }
    if (cache.airport != "*" && seg->getDepStation() != cache.airport) {
        return false;
    }

    const int timeOfDay = static_cast<int>(seg->getStartTimeLocAct() % (60 * 60 * 24));
    if (cache.depStart > 0 && timeOfDay < cache.depStart) {
        return false;
    }
    if (cache.depEnd > 0 && timeOfDay > cache.depEnd) {
        return false;
    }
    if ((cache.expDate != -1 && seg->getStartTimeLocAct() > cache.expDate + 24 * 3600 - 1) ||
        (cache.effDate != -1 && seg->getStartTimeLocAct() < cache.effDate)) {
        return false;
    }
    if (cache.dutyType != "*" && seg->getDomIntType() != cache.dutyType) {
        return false;
    }
    if (!cache.fltNumsVec.empty() && cache.fltNumsVec[0] != "*" &&
        std::find(cache.fltNumsVec.begin(), cache.fltNumsVec.end(), seg->getFlightNumber()) ==
            cache.fltNumsVec.end()) {
        return false;
    }
    if (!cache.fleetsVec.empty() && cache.fleetsVec[0] != "*" &&
        std::find(cache.fleetsVec.begin(), cache.fleetsVec.end(), seg->getFleetCD()) ==
            cache.fleetsVec.end()) {
        return false;
    }
    if (!cache.assignment.empty() && cache.assignment[0] != "*" &&
        std::find(cache.assignment.begin(), cache.assignment.end(), seg->getAssignment()) ==
            cache.assignment.end()) {
        return false;
    }
    if (!cache.dutyAssignments.empty() && cache.dutyAssignments[0] != "*" &&
        std::find(cache.dutyAssignments.begin(),
                  cache.dutyAssignments.end(),
                  duty->getAssignment()) == cache.dutyAssignments.end()) {
        return false;
    }
    if (!cache.airlines.empty() && cache.airlines[0] != "*" &&
        std::find(cache.airlines.cbegin(), cache.airlines.cend(), seg->getAirline()) ==
            cache.airlines.cend()) {
        return false;
    }
    if (cache.isTraining != nullptr && duty->isTrainingAddTime() != *cache.isTraining) {
        return false;
    }
    return true;
}

int findForwardMatched3021BriefMinutes(const Duty* duty,
                                       const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr || dbData == nullptr) {
        return 0;
    }

    const auto& dutyBuilder = dbData->getRuleFunctions(RULES::CHECK_IN_OUT_BRIEF);
    if (dutyBuilder.empty()) {
        return 0;
    }

    for (const auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        if (!isFlyOrDhdAssignment(seg->getAssignment())) {
            continue;
        }

        for (const auto& rule : dutyBuilder) {
            const auto* cache = static_cast<const rule3021*>(rule.parsedParam.get());
            if (cache == nullptr) {
                continue;
            }
            if (!matches3021BriefRule(duty, seg, *cache, dbData)) {
                continue;
            }
            return cache->briefTime;
        }
    }
    return 0;
}

int getEffectiveBriefMinutes(const Duty* duty,
                             const SharedPtr<CrewDataContext>& dbData) {
    const int briefMinutes = getBriefMinutes(duty);
    if (briefMinutes > 0) {
        return briefMinutes;
    }
    return findForwardMatched3021BriefMinutes(duty, dbData);
}

bool matches3022DebriefRule(const Duty* duty,
                            const Segment* seg,
                            const rule3022& cache,
                            const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr || seg == nullptr) {
        return false;
    }

    if ((cache.expDate != -1 && seg->getEndTimeLocAct() > cache.expDate + 24 * 3600 - 1) ||
        (cache.effDate != -1 && seg->getEndTimeLocAct() < cache.effDate)) {
        return false;
    }
    if (cache.airport != "*" && seg->getArrStation() != cache.airport) {
        return false;
    }
    if (cache.dutyType != "*" && seg->getDomIntType() != cache.dutyType) {
        return false;
    }
    if (!cache.fltNumsVec.empty() && cache.fltNumsVec[0] != "*" &&
        std::find(cache.fltNumsVec.begin(), cache.fltNumsVec.end(), seg->getFlightNumber()) ==
            cache.fltNumsVec.end()) {
        return false;
    }
    if (!cache.fleetsVec.empty() && cache.fleetsVec[0] != "*" &&
        std::find(cache.fleetsVec.begin(), cache.fleetsVec.end(), seg->getFleetCD()) ==
            cache.fleetsVec.end()) {
        return false;
    }
    if (!cache.assignment.empty() && cache.assignment[0] != "*" &&
        std::find(cache.assignment.begin(), cache.assignment.end(), seg->getAssignment()) ==
            cache.assignment.end()) {
        return false;
    }
    if (!cache.airlines.empty() && cache.airlines[0] != "*" &&
        std::find(cache.airlines.cbegin(), cache.airlines.cend(), seg->getAirline()) ==
            cache.airlines.cend()) {
        return false;
    }
    if (cache.isTraining != nullptr && duty->isTrainingAddTime() != *cache.isTraining) {
        return false;
    }
    return true;
}

int findBackwardMatched3022DebriefMinutes(const Duty* duty,
                                          const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr || dbData == nullptr) {
        return 0;
    }

    const auto& dutyBuilder = dbData->getRuleFunctions(RULES::CHECK_IN_OUT_DEBRIEF);
    if (dutyBuilder.empty()) {
        return 0;
    }

    const auto& segments = duty->getSegmentsRead();
    for (auto segIt = segments.rbegin(); segIt != segments.rend(); ++segIt) {
        const auto* seg = *segIt;
        if (seg == nullptr) {
            continue;
        }
        if (!isFlyOrDhdAssignment(seg->getAssignment())) {
            continue;
        }

        for (const auto& rule : dutyBuilder) {
            const auto* cache = static_cast<const rule3022*>(rule.parsedParam.get());
            if (cache == nullptr) {
                continue;
            }
            if (!matches3022DebriefRule(duty, seg, *cache, dbData)) {
                continue;
            }
            return cache->debriefTime;
        }
    }
    return 0;
}

int getEffectiveDebriefMinutes(const Duty* duty,
                               const SharedPtr<CrewDataContext>& dbData) {
    const int debriefMinutes = getDebriefMinutes(duty);
    if (debriefMinutes > 0) {
        return debriefMinutes;
    }
    return findBackwardMatched3022DebriefMinutes(duty, dbData);
}

std::string deriveDutyServiceTypeUpper(const Duty* duty) {
    if (duty == nullptr) {
        return "N/A";
    }
    bool sawOperating = false;
    bool allOperatingAreFreighter = true;
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        sawOperating = true;
        if (seg->getServiceType() != "F") {
            allOperatingAreFreighter = false;
            break;
        }
    }
    return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
}

std::string deriveDutyFleetLabel(const Duty* duty, const CrewDataContext* dbData) {
    if (duty == nullptr) {
        return "N/A";
    }
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        const std::string fleet = seg->getFleetCD();
        if (fleet.empty()) {
            continue;
        }
        if (dbData != nullptr) {
            const auto it = dbData->fleetMap.find(fleet);
            if (it != dbData->fleetMap.end() && !it->second.fleetGrp.empty()) {
                return it->second.fleetGrp;
            }
        }
        return fleet;
    }
    if (!duty->getFleetType().empty()) {
        return duty->getFleetType();
    }
    return "N/A";
}
}  // namespace

void CheckAnrReportingDebriefRule::ParseParam(const InputType& input) {
    _param.ParseFromRuleInput(input);
}

bool CheckAnrReportingDebriefRule::CheckRule(const Duty* duty) const {
    if (!_param.hasConfig()) {
        return true;
    }
    return checkDutyInternal(duty, nullptr);
}

bool CheckAnrReportingDebriefRule::CheckRule(const Pairing* pairing) const {
    if (!_param.hasConfig()) {
        return true;
    }
    if (pairing == nullptr) {
        return true;
    }

    bool passAll = true;
    for (const auto* duty : pairing->getDutyVec()) {
        if (!checkDutyInternal(duty, nullptr)) {
            passAll = false;
            if (!IsCheckAllRule()) {
                return false;
            }
        }
    }
    return passAll;
}

bool CheckAnrReportingDebriefRule::CheckRule(
    const std::vector<const ROSTER*>& rosters) const {
    if (!_param.hasConfig()) {
        return true;
    }
    if (rosters.empty()) {
        return true;
    }

    bool passAll = true;
    for (const auto* roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        for (const auto* duty : roster->pairing->getDutyVec()) {
            if (!checkDutyInternal(duty, roster)) {
                passAll = false;
                if (!IsCheckAllRule()) {
                    return false;
                }
            }
        }
    }
    return passAll;
}

bool CheckAnrReportingDebriefRule::checkDutyInternal(const Duty* duty,
                                                     const ROSTER* roster) const {
    if (duty == nullptr) {
        return true;
    }
    if (!hasFlyOrDhdSegment(duty)) {
        return true;
    }
    const auto configs = _param.findConfigsForDuty(duty, this->_dbData.get());
    if (configs.empty()) {
        return true;
    }

    const int briefMinutes = getEffectiveBriefMinutes(duty, this->_dbData);
    const int debriefMinutes = getEffectiveDebriefMinutes(duty, this->_dbData);
    const int totalMinutes = briefMinutes + debriefMinutes;

    bool allValid = true;
    for (const auto* config : configs) {
        if (config == nullptr) {
            continue;
        }

        const bool briefOk = briefMinutes >= config->minBriefMinutes;
        const bool totalOk = totalMinutes >= config->minTotalMinutes;
        if (briefOk && totalOk) {
            continue;
        }

        std::string violated;
        if (!briefOk && !totalOk) {
            violated = "reporting+total";
        } else if (!briefOk) {
            violated = "reporting";
        } else {
            violated = "total";
        }

        throwViolation(
            duty, roster, *config, briefMinutes, debriefMinutes, totalMinutes, violated);
        allValid = false;
        if (!IsCheckAllRule()) {
            return false;
        }
    }
    return allValid;
}

void CheckAnrReportingDebriefRule::throwViolation(
    const Duty* duty,
    const ROSTER* roster,
    const AnrReportingDebriefConfig& config,
    int briefMinutes,
    int debriefMinutes,
    int totalMinutes,
    const std::string& violated) const {
    const std::string briefStr = TimeUtils::MinutesTohhmm(briefMinutes);
    const std::string debriefStr = TimeUtils::MinutesTohhmm(debriefMinutes);
    const std::string totalStr = TimeUtils::MinutesTohhmm(totalMinutes);
    const std::string minBriefStr = TimeUtils::MinutesTohhmm(config.minBriefMinutes);
    const std::string minTotalStr = TimeUtils::MinutesTohhmm(config.minTotalMinutes);

    const std::string assignment =
        duty ? (duty->getAssignment().empty() ? "N/A" : duty->getAssignment()) : "N/A";
    const std::string serviceType = deriveDutyServiceTypeUpper(duty);
    const std::string fleet = deriveDutyFleetLabel(duty, this->_dbData.get());

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->startDTUtc = duty ? duty->getStartTimeUtcAct() : 0;
    rv->endDTUtc = duty ? duty->getEndTimeUtcAct() : 0;
    rv->pairingId = duty ? duty->getPairingId() : -1;
    rv->dutySequenceNumber = duty ? duty->getDutySeq() : -1;
    rv->idRule = config.idRule == 0 ? RuleFuncId : config.idRule;
    rv->ruleParamId = config.idRuleParam;
    rv->description = config.description;
    rv->reference = config.reference;
    rv->ishard = (strToUpper(config.overrideAbility) == "H");
    rv->type = PAIRING_VIOLATION;

    if (roster) {
        rv->crewId = roster->idcrew;
        rv->rosterId = roster->rosterId;
        rv->type = CREW_VIOLATION;
    }

    rv->operation_result.insert(std::make_pair("ruleId", std::to_string(RuleFuncId)));
    rv->operation_result.insert(std::make_pair("reporting", briefStr));
    rv->operation_result.insert(std::make_pair("debrief", debriefStr));
    rv->operation_result.insert(std::make_pair("total", totalStr));
    rv->operation_result.insert(std::make_pair("min_reporting", minBriefStr));
    rv->operation_result.insert(std::make_pair("min_total", minTotalStr));
    rv->operation_result.insert(std::make_pair("violated", violated));
    rv->operation_result.insert(std::make_pair("assignment", assignment));
    rv->operation_result.insert(std::make_pair("service_type", serviceType));
    rv->operation_result.insert(std::make_pair("fleet", fleet));

    std::string msg = "[ANR] Actual reporting " + briefStr +
                      ", debrief " + debriefStr +
                      ", total " + totalStr +
                      " violated " + violated +
                      " (min reporting " + minBriefStr +
                      ", min total " + minTotalStr +
                      "); assignment " + assignment +
                      ", service type " + serviceType +
                      ", fleet " + fleet + ".";
    rv->violation_msg = msg;

    _ruleViolation.AddRuleViolations(rv);
}
