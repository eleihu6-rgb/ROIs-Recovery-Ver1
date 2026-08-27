/**
 * @file CheckAnrMaxFdpRule.cpp
 */

#include "CheckAnrMaxFdpRule.h"

#include "Utility.h"
#include "CrewDB.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "TimezoneUtils.h"

#include <iomanip>
#include <sstream>
#include <cstdlib>

using namespace std;

namespace {
constexpr int kIllegalCompositionRestFacilityTokenMaxMinutes = 1; // <= 00:01 means this combo is not allowed.

std::string getDutyComposition(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr) {
        return {};
    }
    std::string composition = duty->getCompositionName();
    if (composition.empty() && dbData) {
        const std::string derivedComposition =
            DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), dbData);
        if (!derivedComposition.empty()) {
            composition = derivedComposition;
        }
    }
    return composition;
}

std::string formatViolationHeader(std::string reference, std::string category) {
    reference = trim(reference);
    category = trim(category);
    if (!reference.empty() && !category.empty()) {
        return "[" + reference + "][" + category + "]";
    }
    if (!reference.empty()) {
        return "[" + reference + "]";
    }
    if (!category.empty()) {
        return "[" + category + "]";
    }
    return {};
}

std::string formatUtcOffsetMinutes(const int offsetMinutes) {
    const int absMinutes = std::abs(offsetMinutes);
    const int hours = absMinutes / 60;
    const int minutes = absMinutes % 60;

    std::ostringstream oss;
    oss << "UTC" << (offsetMinutes >= 0 ? '+' : '-')
        << std::setw(2) << std::setfill('0') << hours
        << ':'
        << std::setw(2) << std::setfill('0') << minutes;
    return oss.str();
}

int minutesOfDayFromEpochSeconds(const time_t localSeconds) {
    constexpr time_t secondsPerDay = static_cast<time_t>(24 * 60 * 60);
    time_t mod = localSeconds % secondsPerDay;
    if (mod < 0) {
        mod += secondsPerDay;
    }
    return static_cast<int>(mod / 60);
}

std::string formatMinutesOfDay(const int minutesOfDay) {
    const int normalized = ((minutesOfDay % (24 * 60)) + (24 * 60)) % (24 * 60);
    const int hours = normalized / 60;
    const int minutes = normalized % 60;

    std::ostringstream oss;
    oss << std::setw(2) << std::setfill('0') << hours
        << ':'
        << std::setw(2) << std::setfill('0') << minutes;
    return oss.str();
}

std::string formatSectorFilter(const AnrCcAugmentedMaxFdpRow& row) {
    return row.sectorDepPattern.toDisplayString() + "-" +
           row.sectorArrPattern.toDisplayString();
}

std::string formatOptionalStation(const std::string& station) {
    return station.empty() ? std::string("N/A") : station;
}

const Segment* findMatchingSectorFor7413(const Duty* duty, const AnrCcAugmentedMaxFdpRow& row) {
    if (duty == nullptr) {
        return nullptr;
    }
    const Segment* firstSegment = duty->getFirstSegment();
    const std::string dutyStartStation =
        (firstSegment != nullptr) ? firstSegment->getDepStation() : std::string{};
    if (!row.dutyStartPattern.matches(dutyStartStation)) {
        return nullptr;
    }

    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        if (!row.sectorDepPattern.matches(seg->getDepStation())) {
            continue;
        }
        if (!row.sectorArrPattern.matches(seg->getArrStation())) {
            continue;
        }
        const int flyMinutes = static_cast<int>((seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct()) / 60);
        if (flyMinutes >= row.sectorMinFlyMinutes) {
            return seg;
        }
    }
    return nullptr;
}

const DBRule* findRuleDefinitionById(const CrewDataContext& dbData, long long idRule) {
    for (const auto& rule : dbData.ruleList) {
        if (rule.idRule == idRule) {
            return &rule;
        }
    }
    for (const auto& rule : dbData.allRuleList) {
        if (rule.idRule == idRule) {
            return &rule;
        }
    }
    return nullptr;
}

void fillViolationMetaFromRule(const DBRule& rule, RULE_VIOLATION& rv) {
    if (rv.description.empty() && rule.description[0] != '\0') {
        rv.description = rule.description;
    }
    if (rv.reference.empty() && !rule.reference.empty()) {
        rv.reference = rule.reference;
    }
    if (rv.ruleParamId < 0 && rule.idRuleParam > 0) {
        rv.ruleParamId = rule.idRuleParam;
    }
    if (!rv.ishard) {
        rv.ishard = (rule.overridebility == "H");
    }
}

bool isUlrExemptedFromMaxFdp(const Duty* duty,
                            const SharedPtr<CrewDataContext>& dbData,
                            const AnrMaxFdpControl& control) {
    if (duty == nullptr || !duty->isULR()) {
        return false;
    }
    if (duty->getNumSegments() != 1) {
        return false;
    }

    const std::string& exemptComposition = control.ulrExemptionComposition;

    if (control.ulrExemptionRestFacility == -2) {
        return false;
    }

    if (!exemptComposition.empty() && exemptComposition != "*") {
        const std::string dutyComposition = getDutyComposition(duty, dbData);
        if (dutyComposition != exemptComposition) {
            return false; // case-sensitive
        }
    }

    if (control.ulrExemptionRestFacility == -1) {
        return true; // wildcard rest facility
    }
    if (!dbData) {
        return false;
    }
    const int dutyRestFacility = DutyUtils::GetRestfacility(duty, dbData);
    return dutyRestFacility == control.ulrExemptionRestFacility;
}

} // namespace

bool CheckAnrMaxFdpRule::CheckRule(const Duty* duty) const {
    if (_ruleInstances.empty() || !_dbData) {
        return true;
    }
    for (const auto& instance : _ruleInstances) {
        if (instance.param.getRows().empty()) {
            continue;
        }
        if (!checkDutyInternal(duty, nullptr, instance.param)) {
            return false;
        }
    }
    return true;
}

bool CheckAnrMaxFdpRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
    if (_ruleInstances.empty() || !_dbData) {
        return true;
    }
    for (const auto* roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        for (auto* duty : roster->pairing->getDutyVec()) {
            for (const auto& instance : _ruleInstances) {
                if (instance.param.getRows().empty()) {
                    continue;
                }
                if (!checkDutyInternal(duty, roster, instance.param)) {
                    return false;
                }
            }
        }
    }
    return true;
}

MinimumLegalComplementCoverage CheckAnrMaxFdpRule::getMinimumLegalComplementCoverage(const Duty* duty) const {

    MinimumLegalComplementCoverage result = MinimumLegalComplementCoverage::Full;
    for (const auto& instance : _ruleInstances) {
        if (instance.param.getRows().empty()) {
            continue;
        }
        const auto coverage =
            instance.param.getNoPairingMinimumComplementCoverage(duty, _dbData, _application);
        if (coverage == MinimumLegalComplementCoverage::None) {
            return MinimumLegalComplementCoverage::None;
        }
        if (coverage == MinimumLegalComplementCoverage::Partial) {
            result = MinimumLegalComplementCoverage::Partial;
        }
    }
    return result;
}

bool CheckAnrMaxFdpRule::checkDutyInternal(const Duty* duty, const ROSTER* roster, const AnrMaxFdpRuleParam& param) const {
    if (duty == nullptr) {
        return true;
    }
    // ULR exemption: only when duty is ULR, has exactly 1 segment, and composition matches.
    if (isUlrExemptedFromMaxFdp(duty, _dbData, param.getControl())) {
        return true;
    }

    AnrMaxFdpLimit limit;
    if (!param.findEffectiveLimit(duty, this->_dbData, this->_application, limit) ||
        limit.maxFdpMinutes == -1) {
        // No matching 7410 row => do nothing.
        return true;
    }
    
    const long fdpSeconds = duty->getFDPInSecs();
    const int currentFdpMinutes = static_cast<int>(fdpSeconds / 60);

    int maxFdpMinutes = limit.maxFdpMinutes;

    const int bufferMinutes = param.getControl().globalBufferMinutes;
    const int limitWithBuffer = maxFdpMinutes - bufferMinutes;

    // Recompute TZ diff to align with 7410 matching
    const int refOffsetMinutes = duty->getRefTimeZone();
    const int depOffsetMinutes = DutyUtils::GetTimeZoneOffset(*duty, this->_dbData);
    const int tzDiffMinutes = TimezoneUtils::abs(refOffsetMinutes - depOffsetMinutes);

    const int sectors = param.countSectors(duty, tzDiffMinutes);

    if (maxFdpMinutes <= kIllegalCompositionRestFacilityTokenMaxMinutes) {
        throwViolation(duty,
                       roster,
                       currentFdpMinutes,
                       maxFdpMinutes,
                       bufferMinutes,
                       limit,
                       sectors);
        return false;
    }

    if (currentFdpMinutes > limitWithBuffer) {
        throwViolation(duty,
                       roster,
                       currentFdpMinutes,
                       maxFdpMinutes,
                       bufferMinutes,
                       limit,
                       sectors);
        return false;
    }
    return true;
}

void CheckAnrMaxFdpRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();

    if (input.dbRules.empty()) {
        return;
    }

    std::unordered_map<long long, std::size_t> indexByRuleId;
    indexByRuleId.reserve(input.dbRules.size());

    std::vector<long long> ruleIds;
    std::vector<std::vector<DBRule>> dbRulesByInstance;

    for (const auto& dbRule : input.dbRules) {
        const long long ruleId = dbRule.idRule;
        auto it = indexByRuleId.find(ruleId);
        if (it == indexByRuleId.end()) {
            const std::size_t idx = ruleIds.size();
            indexByRuleId.emplace(ruleId, idx);
            ruleIds.push_back(ruleId);
            dbRulesByInstance.emplace_back();
            it = indexByRuleId.find(ruleId);
        }
        dbRulesByInstance[it->second].push_back(dbRule);
    }

    _ruleInstances.reserve(ruleIds.size());
    for (std::size_t i = 0; i < ruleIds.size(); ++i) {
        RuleInstance instance(this, ruleIds[i]);
        RuleInput local;
        local.dbRules = std::move(dbRulesByInstance[i]);
        // Dependent rule tables are treated as global (shared) for all 7410 instances.
        local.dependDbRules = input.dependDbRules;
        local.ruleParamString = input.ruleParamString;
        instance.param.ParseFromRuleInput(local);
        _ruleInstances.emplace_back(std::move(instance));
    }
}

void CheckAnrMaxFdpRule::throwViolation(const Duty* duty,
                                        const ROSTER* roster,
                                        int currentFdpMinutes,
                                        int maxFdpMinutes,
                                        int bufferMinutes,
                                        const AnrMaxFdpLimit& limit,
                                        int sectors) const {
    _ruleViolation.SetParam("current_fdp", Utility::GetInstancePtr()->formatMinutes(currentFdpMinutes));
    _ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(maxFdpMinutes));
    _ruleViolation.SetParam("buffer_minutes", std::to_string(bufferMinutes));

    _ruleViolation.SetParam("duty_start", std::to_string(duty->getStartTimeUtcAct()));
    _ruleViolation.SetParam("duty_end", std::to_string(duty->getEndTimeUtcAct()));
    _ruleViolation.SetParam("pairing_id", std::to_string(duty->getPairingId()));
    _ruleViolation.SetParam("duty_seq", std::to_string(duty->getDutySeq()));
    _ruleViolation.SetParam("sectors", std::to_string(sectors));

    if (roster) {
        _ruleViolation.SetParam("crew_id", roster->idcrew);
        _ruleViolation.SetParam("roster_id", std::to_string(roster->rosterId));
    }

    const std::string dutyComposition = getDutyComposition(duty, _dbData);

    int dutyRestFacility = -1;
    if (_dbData) {
        dutyRestFacility = DutyUtils::GetRestfacility(duty, _dbData);
    }
    const std::string dutyRestFacilityStr =
        (dutyRestFacility >= 0) ? std::to_string(dutyRestFacility) : std::string("N/A");

    const int refOffsetMinutes = duty->getRefTimeZone();
    int depOffsetMinutes = static_cast<int>((duty->getStartTimeLocAct() - duty->getStartTimeUtcAct()) / 60);
    if (duty->getStartTimeLocAct() == 0 && _dbData) {
        depOffsetMinutes = DutyUtils::GetTimeZoneOffset(*duty, _dbData);
    }
    const std::string depOffsetStr = formatUtcOffsetMinutes(depOffsetMinutes);
    const int tzDiffMinutes = TimezoneUtils::abs(refOffsetMinutes - depOffsetMinutes);

    time_t reportLocalSeconds = duty->getStartTimeLocAct();
    if (reportLocalSeconds == 0) {
        reportLocalSeconds = duty->getStartTimeUtcAct() + static_cast<time_t>(depOffsetMinutes) * 60;
    }
    const std::string reportTimeStr =
        formatMinutesOfDay(minutesOfDayFromEpochSeconds(reportLocalSeconds));

    std::string reportBandStr{"N/A"};
    if (limit.baseFDPRow != nullptr) {
        reportBandStr =
            formatMinutesOfDay(limit.baseFDPRow->reportStartMinutes) + "-" +
            formatMinutesOfDay(limit.baseFDPRow->reportEndMinutes);
    }

    auto formatSignedMinutes = [](int minutes) -> std::string {
        const char sign = (minutes >= 0) ? '+' : '-';
        const int absMinutes = std::abs(minutes);
        return std::string(1, sign) + std::to_string(absMinutes);
    };

    std::string reportTimeDiffStr;
    if (limit.applyReportTimeDifference) {
        reportTimeDiffStr = limit.reportTimeDeltaAvailable
                                ? (formatSignedMinutes(limit.reportTimeDeltaMinutes) + "m")
                                : std::string("N/A");
    }

    std::string headerRef;
    std::string headerCat;
    if (_dbData) {
        const DBRule* rule = findRuleDefinitionById(*_dbData, limit.idRule);
        if (rule != nullptr) {
            headerRef = rule->reference;
            headerCat = rule->category;
        }
    }
    if (headerRef.empty()) {
        headerRef = "ANR";
    }
    if (headerCat.empty()) {
        headerCat = "FDP";
    }
    const std::string header = formatViolationHeader(headerRef, headerCat);
    const std::string dutyRoute = duty->getDepartureStation() + "-" + duty->getArrivalStation();
    const std::string dutyLabel =
        "Duty " + std::to_string(duty->getDutySeq()) + " " + dutyRoute;

    auto joinWithPipe = [](const std::vector<std::string>& parts) -> std::string {
        if (parts.empty()) return std::string{};
        std::string outstr;
        outstr = parts.front();
        for (size_t i = 1; i < parts.size(); ++i) {
            outstr += '|';
            outstr += parts[i];
        }
        return outstr;
    };

    vector<string> errorMsgs;
    if (maxFdpMinutes <= kIllegalCompositionRestFacilityTokenMaxMinutes) {
        std::string disallowComposition = dutyComposition.empty() ? std::string("N/A") : dutyComposition;
        std::string disallowRestFacility = dutyRestFacilityStr;
        if (limit.baseFDPRow != nullptr) {
            if (!limit.baseFDPRow->compositions.empty() &&
                limit.baseFDPRow->compositions.front() != "*") {
                disallowComposition = joinWithPipe(limit.baseFDPRow->compositions);
            }
            if (limit.baseFDPRow->restFacility >= 0) {
                disallowRestFacility = std::to_string(limit.baseFDPRow->restFacility);
            }
        }
        string msg =
            "{0:header} {1:duty_label} Composition {2:composition} is not allowed on aircraft(s) with rest facility {3:rest_facility}.";
        msg = StringUtils::Format(msg, header, dutyLabel, disallowComposition, disallowRestFacility);
        errorMsgs.emplace_back(msg);
    } else {
        if (limit.ccAugmentedRow != nullptr) {
            const auto& row = *limit.ccAugmentedRow;
            const std::string sectorFilter = formatSectorFilter(row);
            const std::string dutyStartFilter = row.dutyStartPattern.toDisplayString();
            const std::string minFly = Utility::GetInstancePtr()->formatMinutes(row.sectorMinFlyMinutes);
            const bool hasAnySectorFilter = row.sectorDepPattern.allowAny && row.sectorArrPattern.allowAny;

            const Segment* matchedSeg = findMatchingSectorFor7413(duty, row);
            std::string matchedSector;
            std::string matchedFly;
            if (matchedSeg) {
                matchedSector = matchedSeg->getDepStationRead() + "-" + matchedSeg->getArrStationRead();
                const int flyMinutes = static_cast<int>((matchedSeg->getEndTimeUtcAct() - matchedSeg->getStartTimeUtcAct()) / 60);
                matchedFly = Utility::GetInstancePtr()->formatMinutes(flyMinutes);
            }

            int restFacility = -1;
            if (_dbData) {
                restFacility = DutyUtils::GetRestfacility(duty, _dbData);
            }

            _ruleViolation.SetParam("duty_start_filter", dutyStartFilter);
            _ruleViolation.SetParam("sector_filter", sectorFilter);
            _ruleViolation.SetParam("sector_min_fly", minFly);
            _ruleViolation.SetParam("matched_sector", "");
            _ruleViolation.SetParam("matched_sector_fly", "");
            if (!matchedSector.empty()) {
                _ruleViolation.SetParam("matched_sector", matchedSector);
                _ruleViolation.SetParam("matched_sector_fly", matchedFly);
             }
             _ruleViolation.SetParam("rest_facility", "N/A");
             if (restFacility >= 0) {
                 _ruleViolation.SetParam("rest_facility", std::to_string(restFacility));
             }

            string msg;
            if (hasAnySectorFilter) {
                msg = "{0:header} {1:duty_label} Max FDP Limit with Inflight Rest exceeded: FDP {2:current_fdp} exceeds limit {3:max_fdp} (buffer {4:buffer_minutes}m). "
                      "Inflight-rest limit applied because duty start matches {5:duty_start_filter} and duty has a sector meeting minimum block time {6:sector_min_fly}; rest facility {7:rest_facility}.";
                msg = StringUtils::Format(msg,
                                          header,
                                          dutyLabel,
                                          _ruleViolation.GetParam("current_fdp"),
                                          _ruleViolation.GetParam("max_fdp"),
                                          _ruleViolation.GetParam("buffer_minutes"),
                                          _ruleViolation.GetParam("duty_start_filter"),
                                          _ruleViolation.GetParam("sector_min_fly"),
                                          _ruleViolation.GetParam("rest_facility"));
            } else {
                msg = "{0:header} {1:duty_label} Max FDP Limit with Inflight Rest exceeded: FDP {2:current_fdp} exceeds limit {3:max_fdp} (buffer {4:buffer_minutes}m). "
                      "Inflight-rest limit applied because duty start matches {5:duty_start_filter} and duty has a qualifying sector for has-sector filter {6:sector_filter} with minimum block time {7:sector_min_fly}; rest facility {8:rest_facility}.";
                msg = StringUtils::Format(msg,
                                          header,
                                          dutyLabel,
                                          _ruleViolation.GetParam("current_fdp"),
                                          _ruleViolation.GetParam("max_fdp"),
                                          _ruleViolation.GetParam("buffer_minutes"),
                                          _ruleViolation.GetParam("duty_start_filter"),
                                          _ruleViolation.GetParam("sector_filter"),
                                          _ruleViolation.GetParam("sector_min_fly"),
                                          _ruleViolation.GetParam("rest_facility"));
            }
            if (!hasAnySectorFilter && !_ruleViolation.GetParam("matched_sector").empty()) {
                msg += StringUtils::Format(" Matched sector: {0:sector} ({1:fly}).",
                                          _ruleViolation.GetParam("matched_sector"),
                                          _ruleViolation.GetParam("matched_sector_fly"));
            }
            errorMsgs.emplace_back(msg);
        } else {
            string msg;
            if (limit.applyReportTimeDifference) {
                msg = "{0:header} {1:duty_label} FDP {2:current_fdp} exceeds MaxFDP {3:max_fdp}; buffer={4:buffer_minutes}m. "
                      "MaxFDP derived from: composition={5:composition}; restFacility={6:rest_facility}; "
                      "reportTime={7:report_time} LT (tz={8:tz}, band={9:band}, reportTimeDiff={10:report_time_diff}); "
                      "adj sectors={11:sectors}; tzDiff={12:tz_diff}m.";
                msg = StringUtils::Format(msg,
                                          header,
                                          dutyLabel,
                                          _ruleViolation.GetParam("current_fdp"),
                                          _ruleViolation.GetParam("max_fdp"),
                                          _ruleViolation.GetParam("buffer_minutes"),
                                          dutyComposition.empty() ? std::string("N/A") : dutyComposition,
                                          dutyRestFacilityStr,
                                          reportTimeStr,
                                          depOffsetStr,
                                          reportBandStr,
                                          reportTimeDiffStr,
                                          _ruleViolation.GetParam("sectors"),
                                          std::to_string(tzDiffMinutes));
            } else {
                msg = "{0:header} {1:duty_label} FDP {2:current_fdp} exceeds MaxFDP {3:max_fdp}; buffer={4:buffer_minutes}m. "
                      "MaxFDP derived from: composition={5:composition}; restFacility={6:rest_facility}; "
                      "reportTime={7:report_time} LT (tz={8:tz}, band={9:band}); adj sectors={10:sectors}; tzDiff={11:tz_diff}m.";
                msg = StringUtils::Format(msg,
                                          header,
                                          dutyLabel,
                                          _ruleViolation.GetParam("current_fdp"),
                                          _ruleViolation.GetParam("max_fdp"),
                                          _ruleViolation.GetParam("buffer_minutes"),
                                          dutyComposition.empty() ? std::string("N/A") : dutyComposition,
                                          dutyRestFacilityStr,
                                          reportTimeStr,
                                          depOffsetStr,
                                          reportBandStr,
                                          _ruleViolation.GetParam("sectors"),
                                          std::to_string(tzDiffMinutes));
            }
            if (limit.ccAugmentedConfiguredButNoMatch) {
                const std::string maxSectorBlock =
                    (limit.unmatchedCcAugmentedMaxSectorBlockMinutes >= 0)
                        ? Utility::GetInstancePtr()->formatMinutes(
                              limit.unmatchedCcAugmentedMaxSectorBlockMinutes)
                        : std::string("N/A");
                const std::string unmatchedRestFacility =
                    (limit.unmatchedCcAugmentedRestFacility >= 0)
                        ? std::to_string(limit.unmatchedCcAugmentedRestFacility)
                        : std::string("N/A");
                msg += StringUtils::Format(
                    " In-flight rest is not allowed with sector block time {0:block_time} and rest facility {1:rest_facility}.",
                    maxSectorBlock,
                    unmatchedRestFacility,
                    formatOptionalStation(limit.unmatchedCcAugmentedDutyStartStation));
            }
            errorMsgs.emplace_back(msg);
        }
    }

    string errorMsg;
    for (std::size_t i = 0; i < errorMsgs.size(); ++i) {
        if (i > 0) {
            errorMsg += ", ";
        }
        errorMsg += errorMsgs[i];
    }

    // Build RULE_VIOLATION record
    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->idRule = limit.idRule;
    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;

    if (_dbData) {
        const DBRule* rule = findRuleDefinitionById(*_dbData, rv->idRule);
        if (rule) {
            fillViolationMetaFromRule(*rule, *rv);
        }
    }

    if (roster) {
        rv->crewId = roster->idcrew;
        rv->rosterId = roster->rosterId;
        rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    }

    // OP-style metadata for UI/clients
    rv->operation_result.insert(std::make_pair("ruleId", limit.ccAugmentedRow ? "7413" : "7410"));
    rv->operation_result.insert(std::make_pair("category", headerRef));
    rv->operation_result.insert(std::make_pair("subCategory", headerCat));
    rv->operation_result.insert(std::make_pair("fdp", _ruleViolation.GetParam("current_fdp")));
    rv->operation_result.insert(std::make_pair("max_fdp", _ruleViolation.GetParam("max_fdp")));
    rv->operation_result.insert(std::make_pair("buffer_minutes", _ruleViolation.GetParam("buffer_minutes")));
    rv->operation_result.insert(std::make_pair("sectors", _ruleViolation.GetParam("sectors")));
    if (limit.applyReportTimeDifference && limit.reportTimeDeltaAvailable) {
        rv->operation_result.insert(
            std::make_pair("report_time_diff_minutes", std::to_string(limit.reportTimeDeltaMinutes)));
    }
    if (limit.ccAugmentedRow != nullptr) {
        if (!_ruleViolation.GetParam("rest_facility").empty()) {
            rv->operation_result.insert(std::make_pair("rest_facility", _ruleViolation.GetParam("rest_facility")));
        }
        rv->operation_result.insert(std::make_pair("sector_filter", _ruleViolation.GetParam("sector_filter")));
        rv->operation_result.insert(std::make_pair("sector_min_fly", _ruleViolation.GetParam("sector_min_fly")));
        if (!_ruleViolation.GetParam("matched_sector").empty()) {
            rv->operation_result.insert(std::make_pair("matched_sector", _ruleViolation.GetParam("matched_sector")));
            rv->operation_result.insert(std::make_pair("matched_sector_fly", _ruleViolation.GetParam("matched_sector_fly")));
        }
    }

    rv->violation_msg = errorMsg;
    _ruleViolation.AddRuleViolations(rv);
}
