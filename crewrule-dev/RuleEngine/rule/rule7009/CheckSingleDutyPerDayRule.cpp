#include "CheckSingleDutyPerDayRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>

#include "CrewDB.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CheckSingleDutyPerDayRuleParam.h"
#include "utils/TimeUtils.h"
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"

namespace {

std::string GetPairingBase(const ROSTER* roster, const std::shared_ptr<CrewDataContext>& dbData) {
	if (roster == nullptr) {
		return {};
	}
	if (roster->pairing != nullptr && !roster->pairing->getBase().empty()) {
		return roster->pairing->getBase();
	}
	if (dbData && roster->pairId != 0) {
		auto iter = dbData->pairingIdMap.find(roster->pairId);
		if (iter != dbData->pairingIdMap.end() && iter->second != nullptr) {
			return iter->second->getBase();
		}
	}
	return {};
}

std::string GetPairingBase(const Duty* duty, const std::shared_ptr<CrewDataContext>& dbData) {
	if (duty == nullptr || !dbData) {
		return {};
	}
	auto iter = dbData->pairingIdMap.find(duty->getPairingId());
	if (iter != dbData->pairingIdMap.end() && iter->second != nullptr) {
		return iter->second->getBase();
	}
	return {};
}

std::string GetBaseFromRosters(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
	for (const auto* roster : rosters) {
		std::string base = GetPairingBase(roster, dbData);
		if (!base.empty()) {
			return base;
		}
	}
	return {};
}

std::string GetBaseFromDuties(const std::vector<const Duty*>& duties, const std::shared_ptr<CrewDataContext>& dbData) {
	for (const auto* duty : duties) {
		if (dbData) {
			std::string base = GetPairingBase(duty, dbData);
			if (!base.empty()) {
				return base;
			}
		}
		if (duty != nullptr) {
			if (!duty->getDepStation().empty()) {
				return duty->getDepStation();
			}
			const auto& segs = duty->getSegmentsRead();
			if (!segs.empty() && segs.front() != nullptr && !segs.front()->getDepSta().empty()) {
				return segs.front()->getDepSta();
			}
		}
	}
	return {};
}

std::string GetBaseFromDuties(const std::vector<Duty*>& duties, const std::shared_ptr<CrewDataContext>& dbData) {
	for (const auto* duty : duties) {
		if (dbData) {
			std::string base = GetPairingBase(duty, dbData);
			if (!base.empty()) {
				return base;
			}
		}
		if (duty != nullptr) {
			if (!duty->getDepStation().empty()) {
				return duty->getDepStation();
			}
			const auto& segs = duty->getSegmentsRead();
			if (!segs.empty() && segs.front() != nullptr && !segs.front()->getDepSta().empty()) {
				return segs.front()->getDepSta();
			}
		}
	}
	return {};
}

std::string GetBaseFromSegments(const std::vector<const Segment*>& segments, const std::shared_ptr<CrewDataContext>& dbData) {
	for (const auto* segment : segments) {
		if (segment == nullptr) {
			continue;
		}
		if (dbData) {
			auto iter = dbData->pairingIdMap.find(segment->getPairingId());
			if (iter != dbData->pairingIdMap.end() && iter->second != nullptr && !iter->second->getBase().empty()) {
				return iter->second->getBase();
			}
		}
		if (!segment->getDepSta().empty()) {
			return segment->getDepSta();
		}
	}
	return {};
}

bool IsSameDayByBase(const time_t startUtc, const time_t endUtc, const std::string& base, const std::shared_ptr<CrewDataContext>& dbData) {
	if (!dbData || base.empty()) {
		return false;
	}
	int offsetStart = RosterUtils::GetTimeZoneOffset(startUtc, base, dbData);
	int offsetEnd = RosterUtils::GetTimeZoneOffset(endUtc, base, dbData);
	time_t startDay = TimeUtils::Truncate(startUtc, offsetStart, ChronoUnit::DAYS);
	time_t endDay = TimeUtils::Truncate(endUtc, offsetEnd, ChronoUnit::DAYS);
	return startDay == endDay;
}

}


// Check by crew
bool CheckSingleDutyPerDayRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool isValid = true;
	if (rosters.empty()) {
		return true;
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	const auto & crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	_ruleViolation.SetParam("crew_id", crew->idCrew);

	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;
		_ruleViolation.SetRuleParam(ruleParam);
		if (ruleParam._level == "R") {
			if (rosters.size() == 1)
				continue;

			for (size_t i = 0; i < rosters.size() - 1; i++) {
				const ROSTER* prevRoster = rosters[i];
				const ROSTER* nextRoster = rosters[i + 1];

				if (prevRoster->isMergeDpWithNext && nextRoster->isMergeDpWithBefore) {
					continue;
				}
				isValid = CheckRosterLevel(prevRoster, nextRoster, ruleParam);
				if (this->_application == ROSTER_OPTIMIZER && !isValid)
					return false;
			}
			

		}
		else if (ruleParam._level == "D") {
			std::vector<const Duty*> checkDutyList;
			std::string base = GetBaseFromRosters(rosters, this->_dbData);

			ROSTER* prevRoster = nullptr;
			Duty* prevDuty = nullptr;
			for (auto& roster : rosters) {
				if (!roster->pairing) {
					prevRoster = const_cast<ROSTER*>(roster);
					continue;
				}
				bool isMergeDp = false;
				if (prevRoster != nullptr && prevRoster->isMergeDpWithNext && roster->isMergeDpWithBefore) {
					//合并DP的情况，忽略掉检查
					isMergeDp = true;
				}
				for (auto duty : roster->pairing->getDutyVec()) {
					Duty* nextDuty = duty;
					if (isMergeDp && prevDuty != nullptr && prevRoster != nullptr 
							&& prevRoster->pairId == prevDuty->getPairingId() && prevDuty->getPairingId() != nextDuty->getPairingId()) {
						//合并DP的情况，忽略掉检查
						prevDuty = duty;
						continue;
					}
					isValid = CheckDutyLevel(prevDuty, nextDuty, ruleParam, base);

					if (this->_application == PAIRING_OPTIMIZER && !isValid)
						return false;
					prevDuty = duty;
				}
				prevRoster = const_cast<ROSTER*>(roster);
			}

		}
		else if (ruleParam._level == "S") {
			std::vector<const Segment*> checkSegmentList;
			std::string base = GetBaseFromRosters(rosters, this->_dbData);
			for (const auto& roster : rosters) {
				if (!roster->pairing) {
					continue;
				}
				if (roster->pairing->getSegmentsRead().size() == 1)
					continue;
				for (size_t i = 0; i < roster->pairing->getSegmentsRead().size() - 1; i++) {
					const Segment* prevSeg = roster->pairing->getSegmentsRead()[i];
					const Segment* nextSeg = roster->pairing->getSegmentsRead()[i + 1];
					isValid = CheckSegmentLevel(prevSeg, nextSeg, ruleParam, base);
					if (this->_application == PAIRING_OPTIMIZER && !isValid)
						return false;
				}
			}
		}
	}
	
	return isValid;
}

// Check by pairing
bool CheckSingleDutyPerDayRule::CheckRule(const std::vector<Duty*>& duties) const {
	if (this->_ruleParams.empty() || duties.empty()) {
		return true;
	}

	bool isValid = true;

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		//vector<string> assignments = ruleParam._assignments;
		if (ruleParam._level == "D") {
			std::vector<const Duty*> checkDutyList;
			const std::string base = GetBaseFromDuties(duties, this->_dbData);
			if (duties.size() == 1)
				continue;
			for (size_t i = 0; i < duties.size() - 1; i++) {
				const Duty* prevDuty = duties[i];
				const Duty* nextDuty = duties[i + 1];
				isValid = CheckDutyLevel(prevDuty, nextDuty, ruleParam, base);

				if (this->_application == PAIRING_OPTIMIZER && !isValid)
					return false;
			}
			
			
		}
		else if (ruleParam._level == "S") {
			std::vector<const Segment*> checkSegmentList;
			const std::string base = GetBaseFromDuties(duties, this->_dbData);
			for (const auto& duty : duties) {
				if (duty->getSegmentsRead().size() == 1)
					continue;
				for (size_t i = 0; i < duty->getSegmentsRead().size() - 1; i++) {
					const Segment* prevSeg = duty->getSegmentsRead()[i];
					const Segment* nextSeg = duty->getSegmentsRead()[i + 1];
					isValid = CheckSegmentLevel(prevSeg, nextSeg, ruleParam, base);
					if (this->_application == PAIRING_OPTIMIZER && !isValid)
						return false;
				}
			}
			
			
		}
	}

	return isValid;
}

bool CheckSingleDutyPerDayRule::CheckRosterLevel(const ROSTER* prevRoster, const ROSTER* nextRoster, const CheckSingleDutyPerDayRuleParam& ruleParam) const {
	bool isValid = true;

	if (this->_application == ROSTER_OPTIMIZER && prevRoster->source == "PA" && nextRoster->source == "PA")
		return true;

	time_t start = ruleParam._prevRosterStart == "S" ? prevRoster->getStartTimeLocAct() : prevRoster->getRestStartLocAct();
	time_t end = ruleParam._nextRosterEnd == "E" ? nextRoster->getRestStartLocAct() : nextRoster->getStartTimeLocAct();
	time_t startUtc = ruleParam._prevRosterStart == "S" ? prevRoster->getStartTimeUtcAct() : prevRoster->getRestStartUtcAct();
	time_t endUtc = ruleParam._nextRosterEnd == "E" ? nextRoster->getRestStartUtcAct() : nextRoster->getStartTimeUtcAct();

	if (IgnoreCheck(start, ruleParam)) {
		return true;
	}

	if (!ruleParam.MatchAssignmentA(prevRoster) || !ruleParam.MatchAssignmentB(nextRoster))
		return true;

	if (!ruleParam.MatchFleetGroups(prevRoster) || !ruleParam.MatchFleetGroups(nextRoster))
		return true;

	bool onSameDay = false;
	if (ruleParam._timeZone == "BASE") {
		std::string base = GetPairingBase(nextRoster, this->_dbData);
		if (base.empty()) {
			base = GetPairingBase(prevRoster, this->_dbData);
		}
		if (!base.empty() && this->_dbData) {
			onSameDay = IsSameDayByBase(startUtc, endUtc, base, this->_dbData);
		}
		else {
			onSameDay = TimeUtils::IsSameDay(start, end);
		}
	}
	else {
		onSameDay = TimeUtils::IsSameDay(start, end);
	}
	if (onSameDay) {
		_ruleViolation.SetParam("assignment", prevRoster->qualifier);
		_ruleViolation.SetParam("assignmentNext", nextRoster->qualifier);
		_ruleViolation.SetParam("roster_id", to_string(nextRoster->rosterId));
		_ruleViolation.SetParam("start", to_string(nextRoster->getStartTimeUtcAct()));
		_ruleViolation.SetParam("end", to_string(nextRoster->getEndTimeUtcAct()));
		ThrowRuleViolation(ruleParam);
		isValid = false;
		if (this->_application == ROSTER_OPTIMIZER || this->_application == PAIRING_OPTIMIZER)
			return isValid;
	}
		
	return isValid;
}

bool CheckSingleDutyPerDayRule::CheckDutyLevel(const Duty* prevDuty, const Duty* nextDuty, const CheckSingleDutyPerDayRuleParam& ruleParam, const std::string& base) const {
	if (prevDuty == nullptr || nextDuty == nullptr) {
		return true;
	}
	bool isValid = true;

	time_t start = ruleParam._prevRosterStart == "S" ? prevDuty->getStartTimeLocAct() : prevDuty->getEndTimeLocAct();
	time_t end = ruleParam._nextRosterEnd == "E" ? nextDuty->getEndTimeLocAct() : nextDuty->getStartTimeLocAct();
	time_t startUtc = ruleParam._prevRosterStart == "S" ? prevDuty->getStartTimeUtcAct() : prevDuty->getEndTimeUtcAct();
	time_t endUtc = ruleParam._nextRosterEnd == "E" ? nextDuty->getEndTimeUtcAct() : nextDuty->getStartTimeUtcAct();

	if (IgnoreCheck(start, ruleParam)) {
		return true;
	}

	if (!ruleParam.MatchAssignmentA(prevDuty) || !ruleParam.MatchAssignmentB(nextDuty))
		return true;

	if (!ruleParam.MatchFleetGroups(prevDuty) || !ruleParam.MatchFleetGroups(nextDuty))
		return true;

	bool onSameDay = false;
	if (ruleParam._timeZone == "BASE") {
		if (!base.empty() && this->_dbData) {
			onSameDay = IsSameDayByBase(startUtc, endUtc, base, this->_dbData);
		}
		else {
			onSameDay = TimeUtils::IsSameDay(start, end);
		}
	}
	else {
		onSameDay = TimeUtils::IsSameDay(start, end);
	}
	if (onSameDay) {
		_ruleViolation.SetParam("assignment", prevDuty->getAssignment());
		_ruleViolation.SetParam("assignmentNext", nextDuty->getAssignment());
		_ruleViolation.SetParam("pairing_id", to_string(nextDuty->getPairingId()));
		_ruleViolation.SetParam("start", to_string(nextDuty->getStartTimeUtcAct()));
		_ruleViolation.SetParam("end", to_string(nextDuty->getEndTimeUtcAct()));
		ThrowRuleViolation(ruleParam);
		isValid = false;
		if (this->_application == ROSTER_OPTIMIZER || this->_application == PAIRING_OPTIMIZER)
			return isValid;
	}
	return isValid;
}

bool CheckSingleDutyPerDayRule::CheckSegmentLevel(const Segment* prevSeg, const Segment* nextSeg, const CheckSingleDutyPerDayRuleParam& ruleParam, const std::string& base) const {
	bool isValid = true;

	time_t start = ruleParam._prevRosterStart == "S" ? prevSeg->getStartTimeLocAct() : prevSeg->getEndTimeLocAct();
	time_t end = ruleParam._nextRosterEnd == "E" ? nextSeg->getEndTimeLocAct() : nextSeg->getStartTimeLocAct();
	time_t startUtc = ruleParam._prevRosterStart == "S" ? prevSeg->getStartTimeUtcAct() : prevSeg->getEndTimeUtcAct();
	time_t endUtc = ruleParam._nextRosterEnd == "E" ? nextSeg->getEndTimeUtcAct() : nextSeg->getStartTimeUtcAct();

	if (IgnoreCheck(start, ruleParam)) {
		return true;
	}

	if (!ruleParam.MatchAssignmentA(prevSeg) || !ruleParam.MatchAssignmentB(nextSeg))
		return true;

	if (!ruleParam.MatchFleetGroups(prevSeg) || !ruleParam.MatchFleetGroups(nextSeg))
		return true;

	bool onSameDay = false;
	if (ruleParam._timeZone == "BASE") {
		if (!base.empty() && this->_dbData) {
			onSameDay = IsSameDayByBase(startUtc, endUtc, base, this->_dbData);
		}
		else {
			onSameDay = TimeUtils::IsSameDay(start, end);
		}
	}
	else {
		onSameDay = TimeUtils::IsSameDay(start, end);
	}
	if (onSameDay) {
		_ruleViolation.SetParam("assignment", prevSeg->getAssignment());
		_ruleViolation.SetParam("assignmentNext", nextSeg->getAssignment());
		_ruleViolation.SetParam("pairing_id", to_string(nextSeg->getPairingId()));
		_ruleViolation.SetParam("start", to_string(nextSeg->getStartTimeUtcAct()));
		_ruleViolation.SetParam("end", to_string(nextSeg->getEndTimeUtcAct()));
		ThrowRuleViolation(ruleParam);
		isValid = false;
		if (this->_application == ROSTER_OPTIMIZER || this->_application == PAIRING_OPTIMIZER)
			return isValid;
	}
		
	return isValid;
}

bool CheckSingleDutyPerDayRule::IgnoreCheck(const time_t prevRosterCheckTime, const CheckSingleDutyPerDayRuleParam& ruleParam) const {
	if (ruleParam._prevRosterThreshold.empty() || ruleParam._prevRosterThreshold == RuleParamConstant::IGNORED) {
		return false;
	}
	//获得前一个Roster/Duty/Segment的检查时间（开始时间或结束时间）分钟数
	int prevRosterCheckMinutes = TimeUtils::GetDayMinutes(prevRosterCheckTime);
	if (prevRosterCheckMinutes < ruleParam._prevRosterThresholdMinutes) {
		return true;
	}
	return false;
}

void CheckSingleDutyPerDayRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckSingleDutyPerDayRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}
void CheckSingleDutyPerDayRule::ThrowRuleViolation(const CheckSingleDutyPerDayRuleParam& ruleParam) const {
	string errorMsg = "Assignment ({0:assignment}) and assignment ({1:assignmentNext}) cannot be assigned on the same day.";
	errorMsg = StringUtils::Format(errorMsg, _ruleViolation.GetParam("assignment"), _ruleViolation.GetParam("assignmentNext"));

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string crewId = _ruleViolation.GetParam("crew_id");

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->violation_msg = errorMsg;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("roster_id"), 0);
	rv->idRule = ruleParam.GetId();
	rv->ruleParamId = ruleParam.GetRuleParamId();
	rv->description = ruleParam.GetDescription();
	rv->reference = ruleParam.GetReference();
	rv->ishard = (strToUpper(ruleParam.GetOverrideAbility()) == "H");
	rv->pairingId = StringUtils::stoll(_ruleViolation.GetParam("pairing_id"), 0);
	if (crewId.empty()) {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	else {
		rv->crewId = crewId;
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	}
	_ruleViolation.AddRuleViolations(rv);
}

