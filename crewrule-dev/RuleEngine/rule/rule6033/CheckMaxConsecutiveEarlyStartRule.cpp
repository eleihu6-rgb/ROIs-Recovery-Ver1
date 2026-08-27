#include "CheckMaxConsecutiveEarlyStartRule.h"

#include "RuleParams.h"
#include "CheckMaxConsecutiveEarlyStartRuleParam.h"
#include "../utils/TimeUtils.h"
#include "../utils/RuleViolation.h"
#include "../utils/DutyUtils.h"


bool CheckMaxConsecutiveEarlyStartRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool isValid = true;
	time_t startUtc = 0;
	time_t firstDutyStart = 0;
	bool isCovered = false;
	vector<Duty*> ealyDuties;
	int allowMax, firstMax, secondMax;
	int firstReduceFDP, secondReduceFDP;
	int notEarlierThan = 0;

	for (const auto& _ruleParam : _ruleParams) {

		allowMax = _ruleParam._allowedConsecutiveTimes;
		firstMax = _ruleParam._firstMaxConsecutiveTimes;
		secondMax = _ruleParam._secondMaxConsecutiveTimes;
		firstReduceFDP = _ruleParam._firstReduceFDPTime;
		secondReduceFDP = _ruleParam._secondReduceFDPTimes;
		notEarlierThan = _ruleParam._notEarlierThan;
		_ruleViolation.SetRuleParam(_ruleParam);

		int earlyStartEnd = DutyUtils::GetEarlyStartEnd();
		for (const auto& roster : rosters)
		{
			if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
				continue;
			}
			string roster_type = roster->duty;

			{
				vector<Duty*> oldVector = roster->getOperatingDuties();
				//std::copy(oldVector.begin(), oldVector.end(), std::back_inserter(duties));
				for (vector<Duty*>::iterator duty = oldVector.begin(); duty != oldVector.end(); ++duty)
				{
					if (duty == oldVector.begin())
						firstDutyStart = (*duty)->getStartTimeUtcAct();
					string dep = (*duty)->getDepStation();
					auto offsetMinutes = (*duty)->getRefTimeZone();
					startUtc = (*duty)->getStartTimeUtcAct();

					int depTime = (startUtc + offsetMinutes * 60) % (3600 * 24) / 60;

					//isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(startUtc, offsetMinutes, startLoc , endLoc);
					//isCovered = DutyUtils::IsEarlyStartDuty(startUtc, offsetMinutes);
					if (depTime <= earlyStartEnd)
					{
						ealyDuties.push_back((*duty));
					}

				}

				//if (oldVector.size() == 0)
				//{
				//	startUtc = roster->actStrUtc;
				//	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(roster->location);
				//	isCovered = TimeUtils::IsTimesInRange(startUtc + offsetMinutes * 3600, startLoc, endLoc);
				//	if (isCovered)
				//	{
				//		printf("6033:early roster without duty\n");
				//		//to be changed later
				//	}

				//}

			}
		}

		if ((int)ealyDuties.size() > allowMax)
		{

			// 需记录最后两个duty

			// 最后一个duty
			Duty* prevDuty = NULL;

			// 倒数第二个duty
			Duty* pPrevDuty = NULL;
			int iConsecutiveEarlyDutyies = 0;
			bool isAllPreAssigned = true;
			time_t dutyStartLoc, dutyEndLoc;
			for (vector<Duty*>::iterator duty = ealyDuties.begin(); duty != ealyDuties.end(); ++duty)
			{

				string dep = (*duty)->getDepStation();
				auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(dep);
				dutyStartLoc = (*duty)->getStartTimeUtcAct();
				dutyEndLoc = (*duty)->getEndTimeUtcAct();
				if (allowMax >= iConsecutiveEarlyDutyies && !DutyUtils::IsEarlyStartDuty(dutyStartLoc, (*duty)->getRefTimeZone()))
					continue;
				if (duty == ealyDuties.begin())
					firstDutyStart = (*duty)->getStartTimeUtcAct();


				bool isConsecutive = Utility::GetInstancePtr()->isTwoDutyConsecutives(prevDuty, (*duty), offsetMinutes, 0, 0);
				if (isConsecutive)
				{

					if (iConsecutiveEarlyDutyies == 0)
						firstDutyStart = (*duty)->getStartTimeUtcAct();
					iConsecutiveEarlyDutyies++;
				}
				else
				{

					isValid = CheckConsecutiveEarlyStart(allowMax, firstMax, firstReduceFDP, secondMax, secondReduceFDP, iConsecutiveEarlyDutyies, notEarlierThan, prevDuty, pPrevDuty);
					if (!isValid) {
						_ruleViolation.SetParam("start_utc", std::to_string(firstDutyStart));
						_ruleViolation.SetParam("end_utc", std::to_string(prevDuty->getEndTimeUtcAct()));
						_ruleViolation.SetParam("max_times", std::to_string(allowMax));
						ThrowRuleViolation();
						if (this->_application == ROSTER_OPTIMIZER)
							return isValid;
					}

					iConsecutiveEarlyDutyies = 1;
					firstDutyStart = (*duty)->getStartTimeUtcAct();
				}
				pPrevDuty = prevDuty;
				prevDuty = (*duty);
			}

			isValid = CheckConsecutiveEarlyStart(allowMax, firstMax, firstReduceFDP, secondMax, secondReduceFDP, iConsecutiveEarlyDutyies, notEarlierThan, prevDuty, pPrevDuty);
			if (!isValid) {
				_ruleViolation.SetParam("start_utc", std::to_string(firstDutyStart));
				_ruleViolation.SetParam("end_utc", std::to_string(prevDuty->getEndTimeUtcAct()));
				_ruleViolation.SetParam("max_times", std::to_string(allowMax));
				ThrowRuleViolation();
				if (this->_application == ROSTER_OPTIMIZER)
					return isValid;
			}
		}
	}

	return isValid;
}

bool CheckMaxConsecutiveEarlyStartRule::CheckConsecutiveEarlyStart(int allowMax, int firstMax, int firstReduceFDP, int secondMax, int secondReduceFDP, int consecutiveEarlyDuties, int notEarlierThan, Duty* prevDuty, Duty* pPrevDuty) const {

	if (consecutiveEarlyDuties > allowMax)
	{
		if (consecutiveEarlyDuties < secondMax) {
			_ruleViolation.SetParam("consecutive_early_duties", std::to_string(firstMax));
			if (notEarlierThan > 0) {
				auto offsetMinutes = prevDuty->getRefTimeZone();
				time_t dutyStartLoc = prevDuty->getStartTimeUtcAct();
				int depTime = (dutyStartLoc + offsetMinutes * 60) % (3600 * 24) / 60;
				if (depTime < notEarlierThan) {
					_ruleViolation.SetParam("duty_day", std::to_string(firstMax));
					_ruleViolation.SetParam("duty_earlier", TimeUtils::MinutesTohhmm(notEarlierThan));
					return false;
				}
			}
			
			int actFDP = prevDuty->getActualFDP();
			int planFDP = prevDuty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			if (planFDP - actFDP < firstReduceFDP) {
				_ruleViolation.SetParam("reduce_fdp", Utility::GetInstancePtr()->formatMinutes(firstReduceFDP));
				return false;
			}
		}
		else if (consecutiveEarlyDuties == secondMax) {
			_ruleViolation.SetParam("consecutive_early_duties", std::to_string(secondMax));
			if (notEarlierThan > 0) {
				auto firstOffsetMinutes = pPrevDuty->getRefTimeZone();
				time_t firstDutyStartLoc = pPrevDuty->getStartTimeUtcAct();
				int firstDepTime = (firstDutyStartLoc + firstOffsetMinutes * 60) % (3600 * 24) / 60;
				if (firstDepTime < notEarlierThan) {
					_ruleViolation.SetParam("duty_day", std::to_string(firstMax));
					_ruleViolation.SetParam("duty_earlier", TimeUtils::MinutesTohhmm(notEarlierThan));
					return false;
				}
			}
			
			int firstDutyActFDP = pPrevDuty->getActualFDP();
			int firstDutyPlanFDP = pPrevDuty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			if (firstDutyPlanFDP - firstDutyActFDP < firstReduceFDP) {
				_ruleViolation.SetParam("reduce_fdp", Utility::GetInstancePtr()->formatMinutes(firstReduceFDP));
				return false;
			}
			if (notEarlierThan > 0) {
				auto secondOffsetMinutes = prevDuty->getRefTimeZone();
				time_t secondDutyStartLoc = prevDuty->getStartTimeUtcAct();
				int secondDepTime = (secondDutyStartLoc + secondOffsetMinutes * 60) % (3600 * 24) / 60;
				if (secondDepTime < notEarlierThan) {
					_ruleViolation.SetParam("duty_day", std::to_string(secondMax));
					_ruleViolation.SetParam("duty_earlier", TimeUtils::MinutesTohhmm(notEarlierThan));
					return false;
				}
			}
			
			int secondDutyActFDP = prevDuty->getActualFDP();
			int secondDutyPlanFDP = prevDuty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			if (secondDutyPlanFDP - secondDutyActFDP < secondReduceFDP) {
				_ruleViolation.SetParam("reduce_fdp", Utility::GetInstancePtr()->formatMinutes(secondReduceFDP));
				return false;
			}
		}
		else {
			_ruleViolation.SetParam("consecutive_early_duties", std::to_string(consecutiveEarlyDuties));
			_ruleViolation.SetParam("max_times", std::to_string(secondMax));
			return false;
		}
	}
	return true;
}

void CheckMaxConsecutiveEarlyStartRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	//Number of consecutive early duties ({0:consecutive_early_duties}) is more than the maximum allowed ({1:max_times}), and the duty day {2:duty_day} start time is earlier than ({3:duty_earlier}).
	string msg = "Number of consecutive early duties (" + _ruleViolation.GetParam("consecutive_early_duties") + ") is more than the maximum allowed (";
	msg += _ruleViolation.GetParam("max_times") + ")";
	if (!_ruleViolation.GetParam("duty_earlier").empty()) {
		msg += ", and the duty day " + _ruleViolation.GetParam("duty_day") + " start time is earlier than (" + _ruleViolation.GetParam("duty_earlier") + ").";
	}
	//Number of consecutive early duties ({0:consecutive_early_duties}) is more than the maximum allowed ({1:max_times}), and the flight duty period of the last duty is not reduced ({2:reduce_fdp}).
	if (!_ruleViolation.GetParam("reduce_fdp").empty()) {
		msg += ", and the flight duty period of the last duty is not reduced (" + _ruleViolation.GetParam("reduce_fdp") + ").";
	}
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = stol(_ruleViolation.GetParam("start_utc"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("end_utc"));
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("iConsecutiveEarlyDutyies", _ruleViolation.GetParam("consecutive_early_duties")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_times")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxConsecutiveEarlyStartRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxConsecutiveEarlyStartRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
		return;
	}
}