/**
 * @file CheckMinSpaceBetweenDutyForRPRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckMinSpaceBetweenDutyForRPRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "../period/WorkPeriod.h"


using namespace std;

void CheckMinSpaceBetweenDutyForRPRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;
        if (header == "BASES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _bases);
            }
        }
        else if (header == "RANKS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _ranks);
            }
        }
        else if (header == "FLEETS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _fleets);
            }
        }
        else if (header == "TEAMS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _teams);
            }
        }
        else if (header == "PREV DUTY ASSIGNMENT GROUPS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _prevDutyAssignmentGroups);
            }
        }
        else if (header == "NEXT DUTY ASSIGNMENT GROUPS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _nextDutyAssignmentGroups);
            }
        }
        else if (header == "PREV DUTY ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _prevDutyAssignments);
            }
        }
        else if (header == "NEXT DUTY ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _nextDutyAssignments);
            }
        }
        else if (header == "PREV DUTY TIME RANGE") {
            _prevDutyTimeRange = headeValue;
            if (headeValue != RuleParamConstant::ALL) {
                vector<string> splitstrs;
                split(headeValue.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _prevDutyTimeRangeStart = hhmmStrToMinutes(splitstrs[0].c_str());
                    _prevDutyTimeRangeEnd = hhmmStrToMinutes(splitstrs[1].c_str());
                }
            }
        }
        else if (header == "NEXT DUTY TIME RANGE") {
            _nextDutyTimeRange = headeValue;
            if (headeValue != RuleParamConstant::ALL) {
                vector<string> splitstrs;
                split(headeValue.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _nextDutyTimeRangeStart = hhmmStrToMinutes(splitstrs[0].c_str());
                    _nextDutyTimeRangeEnd = hhmmStrToMinutes(splitstrs[1].c_str());
                }
            }
        }
        else if (header == "MIN REST PERIOD") {
            if (headeValue != RuleParamConstant::ALL) {
                _minRestPeriod = stoi(headeValue);
            }
        }
        else if (header == "REST UNIT") {
            if (headeValue != RuleParamConstant::ALL) {
                _restUnit = headeValue;
            }
        }
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}


bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchRuleParam(WorkPeriod* currentWokrPeriod, WorkPeriod* nextWorkPeriod) const {

    if (!MatchAssignment(currentWokrPeriod, nextWorkPeriod)) {
        return false;
    }

    if (!MatchTimeRange(currentWokrPeriod, nextWorkPeriod)) {
        return false;
    }

    return true;
    
}

bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchRuleParam(const Duty * currentWokrPeriod, const Duty * nextWorkPeriod) const {

    if (!MatchAssignment(currentWokrPeriod, nextWorkPeriod)) {
        return false;
    }

    if (!MatchTimeRange(currentWokrPeriod, nextWorkPeriod)) {
        return false;
    }

    return true;

}

bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchAssignment(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const {
    const auto& currentAssignment = currentWokrPeriod->getAssignment();
    const auto& nextAssignment = nextWorkPeriod->getAssignment();

    if (!_prevDutyAssignmentGroups.empty() && _prevDutyAssignmentGroups[0] != "" && _prevDutyAssignmentGroups[0] != "*") {
        bool matchGroup = false;
        for (const auto& assigmentGroup : _prevDutyAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(currentAssignment, assigmentGroup)) {
                matchGroup = true;
            }
        }
        if (!matchGroup)
            return false;
    }

    if (!_prevDutyAssignments.empty() && _prevDutyAssignments[0] != "" && _prevDutyAssignments[0] != "*"
        && find(_prevDutyAssignments.begin(), _prevDutyAssignments.end(), currentAssignment) == _prevDutyAssignments.end())
        return false;

    if (!_nextDutyAssignmentGroups.empty() && _nextDutyAssignmentGroups[0] != "" && _nextDutyAssignmentGroups[0] != "*") {
        bool matchGroup = false;
        for (const auto& assigmentGroup : _nextDutyAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(nextAssignment, assigmentGroup)) {
                matchGroup = true;
            }
        }
        if (!matchGroup)
            return false;
    }

    if (!_nextDutyAssignments.empty() && _nextDutyAssignments[0] != "" && _nextDutyAssignments[0] != "*"
        && find(_nextDutyAssignments.begin(), _nextDutyAssignments.end(), nextAssignment) == _nextDutyAssignments.end())
        return false;

    return true;
}

bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchAssignment(const WorkPeriod* currentWokrPeriod, const WorkPeriod* nextWorkPeriod) const {

    const auto& currentAssignment = currentWokrPeriod->GetWorkType() != WorkType::FltDuty ? ((ROSTER*)currentWokrPeriod->GetWork())->qualifier : ((Duty*)currentWokrPeriod->GetWork())->getAssignment();
    const auto& nextAssignment = nextWorkPeriod->GetWorkType() != WorkType::FltDuty ? ((ROSTER*)nextWorkPeriod->GetWork())->qualifier : ((Duty*)nextWorkPeriod->GetWork())->getAssignment();

    if (!_prevDutyAssignmentGroups.empty() && _prevDutyAssignmentGroups[0] != "" && _prevDutyAssignmentGroups[0] != "*") {
        bool matchGroup = false;
        for (const auto& assigmentGroup : _prevDutyAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(currentAssignment, assigmentGroup)) {
                matchGroup = true;
            }
        }
        if (!matchGroup)
            return false;
    }

    if (!_prevDutyAssignments.empty() && _prevDutyAssignments[0] != "" && _prevDutyAssignments[0] != "*"
        && find(_prevDutyAssignments.begin(), _prevDutyAssignments.end(), currentAssignment) == _prevDutyAssignments.end())
        return false;

    if (!_nextDutyAssignmentGroups.empty() && _nextDutyAssignmentGroups[0] != "" && _nextDutyAssignmentGroups[0] != "*") {
        bool matchGroup = false;
        for (const auto& assigmentGroup : _nextDutyAssignmentGroups) {
            if (this->GetRule()->GetDataContext()->isAssignmentInGroup(nextAssignment, assigmentGroup)) {
                matchGroup = true;
            }
        }
        if (!matchGroup)
            return false;
    }

    if (!_nextDutyAssignments.empty() && _nextDutyAssignments[0] != "" && _nextDutyAssignments[0] != "*"
        && find(_nextDutyAssignments.begin(), _nextDutyAssignments.end(), nextAssignment) == _nextDutyAssignments.end())
        return false;

    return true;
}

bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchTimeRange(WorkPeriod* currentWokrPeriod, WorkPeriod* nextWorkPeriod) const {

    if (!_prevDutyTimeRange.empty() && _prevDutyTimeRange != "*") {
        const auto& endTime = currentWokrPeriod->GetEndTimeLoc();
        if (!TimeUtils::IsTimesInRange(endTime, _prevDutyTimeRangeStart, _prevDutyTimeRangeEnd)) {
            return false;
        }
    }

    if (!_nextDutyTimeRange.empty() && _nextDutyTimeRange != "*") {
        const auto& startTime = nextWorkPeriod->GetStartTimeLoc();
        if (!TimeUtils::IsTimesInRange(startTime, _nextDutyTimeRangeStart, _nextDutyTimeRangeEnd)) {
            return false;
        }
    }

    return true;
}

bool CheckMinSpaceBetweenDutyForRPRuleParam::MatchTimeRange(const Duty* currentWokrPeriod, const Duty* nextWorkPeriod) const {

    if (!_prevDutyTimeRange.empty() && _prevDutyTimeRange != "*") {
        const auto& endTime = currentWokrPeriod->getEndTimeLocAct() + currentWokrPeriod->getMinDropoff() * 60;
        if (!TimeUtils::IsTimesInRange(endTime, _prevDutyTimeRangeStart, _prevDutyTimeRangeEnd)) {
            return false;
        }
    }

    if (!_nextDutyTimeRange.empty() && _nextDutyTimeRange != "*") {
        const auto& startTime = nextWorkPeriod->getStartTimeLocAct() - nextWorkPeriod->getMinPickup() * 60;
        if (!TimeUtils::IsTimesInRange(startTime, _nextDutyTimeRangeStart, _nextDutyTimeRangeEnd)) {
            return false;
        }
    }

    return true;
}

bool CheckMinSpaceBetweenDutyForRPRuleParam::CheckMinRest(const time_t restStartTime, const time_t restEndTime) const {
    
    if (_restUnit != "RH" && _restUnit != "CD")
        return true;

    time_t minRestEnd = restStartTime;
    if (_restUnit == "RH") {
        minRestEnd = minRestEnd + _minRestPeriod * 3600;
    }
    else if (_restUnit == "CD") {
        const auto & startDay = TimeUtils::GetStartTimeOfDay(minRestEnd) + (3600 * 24);
        minRestEnd = startDay + _minRestPeriod * (3600 * 24);
    }

    if (restEndTime < minRestEnd) {
        return false;
    }

    return true;
}