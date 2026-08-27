#include "CheckMaxEarlyDutyInAnyConsecutiveDayRule.h"

#include "RuleParams.h"
#include "CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam.h"
#include "../utils/TimeUtils.h"
#include "../utils/RuleViolation.h"
#include "../utils/StringUtils.h"
#include "StringUtil.h"



bool CheckMaxEarlyDutyInAnyConsecutiveDayRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool isValid = true;
	time_t startUtc = 0;
	time_t firstDutyStart = 0;
	bool isCovered = false;
	vector<Duty*> ealyDuties;
	int dutyEarierThan, maxTimes, period;
	string unit, checkType;
	int checkRange = 0;

	if (rosters.size() == 0)
		return true;
	vector<string> positionsVec;
	split("*", '|', positionsVec);
	vector<string> teamVec;
	split("*", '|', teamVec);
	vector<string> bases;
	vector<string> ranks;
	vector<string> fleets;
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	for (const auto & _ruleParam : _ruleParams) {

		dutyEarierThan = _ruleParam._dutyEarierThan * 60;
		maxTimes = _ruleParam._maxTimes;
		period = _ruleParam._period;
		unit = _ruleParam._unit;
		checkType = _ruleParam._checkType;
		bases = _ruleParam._bases;
		ranks = _ruleParam._ranks;
		fleets = _ruleParam._fleets;
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("earier_time", TimeUtils::MinutesTohhmm(dutyEarierThan / 60));
		_ruleViolation.SetParam("max_times", std::to_string(maxTimes));

		if (unit == "RH") {
			checkRange = period * 3600;
		}
		else if (unit == "CD") {
			checkRange = period * 24 * 3600;
		}
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, fleets, teamVec, positionsVec, lCheckedStart, lCheckedEnd))
			continue;
		vector<WORKDUTY_TIMES *> works;
		for (const auto & roster : rosters)
		{
			if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
				continue;
			}
			string rosterAsnment = roster->duty;
			Pairing * pg = roster->pairing;

			if (!_ruleParam.MatchAssignment(roster->qualifier))
				continue;

			if (!pg || checkType == "P")
			{
				time_t startTime = roster->getStartTimeLocAct() % (3600 * 24);//与当天0点的秒数差

				if (startTime < dutyEarierThan) {
					WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
					work->startLocTime = roster->getStartTimeLocAct();
					work->endLocTime = roster->getStartTimeLocAct();
					work->needRuleCheck = true;
					if (roster->source == "PA") {
						work->needRuleCheck = false;
					}
					works.push_back(work);
				}
				
				continue;
			}
			vector<Duty *> dutylist = pg->getDutyVec();
			if (dutylist.empty())
				continue;
			for (size_t i = 0; i < dutylist.size(); i++)
			{
				Duty::DUTY_TYPE dt = dutylist[i]->getType();
				time_t start = dutylist[i]->getStartTimeLocAct() - dutylist[i]->getActualPickupMin() * 60;
				time_t end = dutylist[i]->getEndTimeLocAct() + dutylist[i]->getActualDropoffMin() * 60;
				int startTime = start % (3600 * 24);
				if (startTime < dutyEarierThan &&
					(dt != Duty::DUTY_PAIRING_REST) && (dt != Duty::DUTY_BLANK_DAY))
				{
					WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
					work->startLocTime = start;
					work->endLocTime = end;
					work->needRuleCheck = true;
					if (roster->source == "PA") {
						work->needRuleCheck = false;
					}
					works.push_back(work);
				}
			}
		}


		isValid = CheckHasDutyMoreThanMaxTimesInDays(works, maxTimes, unit, checkRange);
		for (auto& work : works)
			delete work;
		if (!isValid) {
			return isValid;
		}
	}


	return isValid;
}

bool CheckMaxEarlyDutyInAnyConsecutiveDayRule::CheckHasDutyMoreThanMaxTimesInDays(vector<WORKDUTY_TIMES*> workTimes, int maxTimes, string unit, int checkRange) const {
	
	bool isValid = true;
	for (const auto & work : workTimes) {
		if (!work->needRuleCheck) continue;
		time_t checkStart, checkEnd;
		checkStart = work->startLocTime;
		if (unit == "RH") {
			checkEnd = checkStart + checkRange;
		}
		else if (unit == "CD") {
			checkStart = TimeUtils::GetStartTimeOfDay(checkStart);
			checkEnd = checkStart + checkRange;
		}
		else {
			checkEnd = checkStart + checkRange;
		}
		int count = GetDutyNumberInRange(checkStart, checkEnd, workTimes);
		if (count > maxTimes) {
			isValid = false;
			if (!IsCheckAllRule()) {
				return isValid;
			}
			_ruleViolation.SetParam("count", std::to_string(count));
			_ruleViolation.SetParam("check_start", std::to_string(checkStart));
			_ruleViolation.SetParam("check_end", std::to_string(checkEnd));
			ThrowRuleViolation();
			return isValid;
		}
	}
	return isValid;
}

int CheckMaxEarlyDutyInAnyConsecutiveDayRule::GetDutyNumberInRange(time_t start, time_t end, vector<WORKDUTY_TIMES*> workTimes) const {
	int count = 0;
	for (const auto & work : workTimes) {
		if (work->startLocTime <= end && work->endLocTime >= start) {
			++count;
		}
	}
	return count;
}

void CheckMaxEarlyDutyInAnyConsecutiveDayRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	string msg = "There are {0:count} early duties (before {1:earier_time}) which is more than the maximum allowed ({2:max_times}) in the period ({3:check_start}-{4:check_end}).";
	msg = StringUtils::Format(msg,
			_ruleViolation.GetParam("count"), _ruleViolation.GetParam("earier_time"),
			_ruleViolation.GetParam("max_times"),
			TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("check_start"), 0), "yyyy-mm-dd"),
			TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("check_end"), 0), "yyyy-mm-dd"));


	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = stol(_ruleViolation.GetParam("check_start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("check_end"));
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("iEarlyDutyies", _ruleViolation.GetParam("count")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_times")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxEarlyDutyInAnyConsecutiveDayRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
		return;
	}
}