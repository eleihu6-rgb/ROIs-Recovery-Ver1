#include "CheckMaxConsecutiveWOCLDutyRule.h"

#include "RuleParams.h"
#include "CheckMaxConsecutiveWOCLDutyRuleParam.h"
#include "../utils/TimeUtils.h"
#include "../utils/RuleViolation.h"
#include "../utils/DutyUtils.h"



bool CheckMaxConsecutiveWOCLDutyRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool isValid = true;
	time_t firstDutyStart = 0;
	bool isCovered = false;
	vector<Duty*> ealyDuties;
	int allowMax, firstMax, secondMax;
	int firstReduceFDP, secondReduceFDP;
	int needLocalNightNum = 0;
	int notEarlierThan = 0;
	for (const auto & _ruleParam : _ruleParams) {

		allowMax = _ruleParam._allowedConsecutiveTimes;
		firstMax = _ruleParam._firstMaxConsecutiveTimes;
		secondMax = _ruleParam._secondMaxConsecutiveTimes;
		firstReduceFDP = _ruleParam._firstReduceFDPTime;
		secondReduceFDP = _ruleParam._secondReduceFDPTimes;
		needLocalNightNum = _ruleParam._needLocalNightNum;
		notEarlierThan = _ruleParam._notEarlierThan;
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.ClearParam();
	}
	//int woclEnd = DutyUtils::GetWoclEnd();
	for (const auto & roster : rosters)
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
				
				
				if (DutyUtils::IsWoclDuty((*duty), this->_dbData) || DutyUtils::IsEarlyStartDuty((*duty)))
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
		vector<Duty*> checkVector;
		for (vector<Duty*>::iterator duty = ealyDuties.begin(); duty != ealyDuties.end(); ++duty)
		{
			
			//string dep = (*duty)->getDepStation();
			auto offsetMinutes = (*duty)->getRefTimeZone();
			/*dutyStartLoc = (*duty)->getStartTimeUtcAct();
			dutyEndLoc = (*duty)->getEndTimeUtcAct();
			if (allowMax >= iConsecutiveEarlyDutyies && !DutyUtils::IsWoclDuty((*duty)->getStartTimeUtcAct(), (*duty)->getRefTimeZone()))
				continue;*/
			if (duty == ealyDuties.begin())
				firstDutyStart = (*duty)->getStartTimeUtcAct();

			bool isConsecutive = Utility::GetInstancePtr()->isTwoDutyConsecutives(prevDuty, (*duty), offsetMinutes, 0, 0);
			if (isConsecutive)
			{

				if (iConsecutiveEarlyDutyies == 0)
					firstDutyStart = (*duty)->getStartTimeUtcAct();
				iConsecutiveEarlyDutyies++;
				checkVector.push_back((*duty));
			}
			else
			{

				isValid = CheckConsecutiveWOCL(allowMax, firstMax, firstReduceFDP, needLocalNightNum, 4, secondMax, secondReduceFDP, iConsecutiveEarlyDutyies, notEarlierThan, checkVector);
				if (!isValid) {
					_ruleViolation.SetParam("start_utc", std::to_string(firstDutyStart));
					_ruleViolation.SetParam("end_utc", std::to_string(prevDuty->getEndTimeUtcAct()));
					_ruleViolation.SetParam("max_times", std::to_string(allowMax));
					ThrowRuleViolation();
					if (this->_application == ROSTER_OPTIMIZER)
						return isValid;
				}
				checkVector.clear();
				iConsecutiveEarlyDutyies = 1;
				checkVector.push_back((*duty));
				firstDutyStart = (*duty)->getStartTimeUtcAct();
			}
			pPrevDuty = prevDuty;
			prevDuty = (*duty);
		}

		isValid = CheckConsecutiveWOCL(allowMax, firstMax, firstReduceFDP, needLocalNightNum, 4, secondMax, secondReduceFDP, iConsecutiveEarlyDutyies, notEarlierThan, checkVector);
		if (!isValid) {
			_ruleViolation.SetParam("start_utc", std::to_string(firstDutyStart));
			_ruleViolation.SetParam("end_utc", std::to_string(prevDuty->getEndTimeUtcAct()));
			_ruleViolation.SetParam("max_times", std::to_string(allowMax));
			ThrowRuleViolation();
			if (this->_application == ROSTER_OPTIMIZER)
				return isValid;
		}
	}

	return isValid;
}

bool CheckMaxConsecutiveWOCLDutyRule::CheckConsecutiveWOCL(int allowMax, int firstMax, int firstReduceFDP, int needLocalNightNum, int checkLocalNightIndex, int secondMax, int secondReduceFDP, int consecutiveEarlyDuties, int notEarlierThan, vector<Duty*> checkVector) const {
	if (consecutiveEarlyDuties > allowMax)
	{
		Duty* prevDuty = checkVector.at(checkVector.size() - 1);
		Duty* pPrevDuty = checkVector.at(checkVector.size() - 2);

		// localNight检查
		if (checkLocalNightIndex > 0 && checkLocalNightIndex < (int)checkVector.size()) {
			// localNight检查
			if (DutyUtils::IsWoclDuty(checkVector.at(checkLocalNightIndex - 1), this->_dbData)) {
				time_t pPrevDutyEnd = checkVector.at(checkLocalNightIndex - 2)->getEndTimeUtcAct();
				time_t prevDutyStart = checkVector.at(checkLocalNightIndex - 1)->getStartTimeUtcAct();
				int offsetMinutes = this->_dbData->getAirportOffsetMinutes(checkVector.at(checkLocalNightIndex - 2)->getArrivalStation());
				int localNight = DutyUtils::GetLocalNightNums(pPrevDutyEnd, prevDutyStart, offsetMinutes);
				if (localNight < needLocalNightNum) {
					_ruleViolation.SetParam("local_night", std::to_string(needLocalNightNum));
					return false;
				}
			}
		}

		if (consecutiveEarlyDuties < secondMax) {
			_ruleViolation.SetParam("consecutive_wocl_duties", std::to_string(firstMax));
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
				_ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(planFDP - firstReduceFDP));
				_ruleViolation.SetParam("index", to_string(checkVector.size()));
				return false;
			}

			
		}
		else if (consecutiveEarlyDuties == secondMax) {
			_ruleViolation.SetParam("consecutive_wocl_duties", std::to_string(secondMax));
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
				_ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(firstDutyPlanFDP - firstReduceFDP));
				_ruleViolation.SetParam("index", to_string(checkVector.size() - 1));
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
				_ruleViolation.SetParam("max_fdp", Utility::GetInstancePtr()->formatMinutes(secondDutyPlanFDP - secondReduceFDP));
				_ruleViolation.SetParam("index", to_string(checkVector.size()));
				return false;
			}
		}
		else {
			_ruleViolation.SetParam("consecutive_wocl_duties", std::to_string(consecutiveEarlyDuties));
			_ruleViolation.SetParam("max_times", std::to_string(secondMax));
			return false;
		}
	}
	return true;
}

int CheckMaxConsecutiveWOCLDutyRule::GetLocalNightNum(const time_t startTimeUtc, const time_t endTimeUtc, const int needLocalNightNum, const int offsetTZMinute) const {
	Local_Night_Definition& local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	int numberOfLocalNighs = Utility::GetInstancePtr()->howManyLocalNightsInRest(startTimeUtc, endTimeUtc, 1, local_night, offsetTZMinute);
	return numberOfLocalNighs;
}

void CheckMaxConsecutiveWOCLDutyRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	

	//Number of consecutive WOCL duties ({0:consecutive_wocl_duties}) is more than the maximum allowed ({1:max_times}), and the flight duty period of the last duty is not reduced ({2:reduce_fdp}).
	string msg = "Number of consecutive WOCL duties(" + _ruleViolation.GetParam("consecutive_wocl_duties") + ") is more than the maximum allowed(";
	msg += _ruleViolation.GetParam("max_times") + ")";
	if (!_ruleViolation.GetParam("duty_earlier").empty()) {
		//Number of consecutive WOCL duties({ 0:consecutive_wocl_duties }) is more than the maximum allowed({ 1:max_times }), and the duty day{ 2:duty_day } start time is earlier than({ 3:duty_earlier }).
		msg += ", and the duty day(" + _ruleViolation.GetParam("duty_day") + ") start time is earlier than(" + _ruleViolation.GetParam("duty_earlier") + ")";
	}
	if (!_ruleViolation.GetParam("reduce_fdp").empty()) {
		//Number of consecutive WOCL duties ({0:consecutive_wocl_duties}) is more than the maximum allowed ({1:max_times}), and the flight duty period of the last duty is not reduced ({2:reduce_fdp}).
		msg += ", and the " + _ruleViolation.GetParam("index") + "the duty FDP is exceeds the Max FDP (" + _ruleViolation.GetParam("max_fdp") + ") by reducing (" + _ruleViolation.GetParam("reduce_fdp") + ").";
	}
	if (!_ruleViolation.GetParam("local_night").empty()) {
	 //Number of consecutive WOCL duties ({0:consecutive_wocl_duties}) is more than the maximum allowed ({1:max_times}), and there are no ({2:local_night}) local nights.
		msg += ", and there are no (" + _ruleViolation.GetParam("local_night") + ") local nights";
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
	rv->operation_result.insert(pair<string, string>("iConsecutiveWOCLDutyies", _ruleViolation.GetParam("consecutive_wocl_duties")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_times")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxConsecutiveWOCLDutyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxConsecutiveWOCLDutyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
		return;
	}
}