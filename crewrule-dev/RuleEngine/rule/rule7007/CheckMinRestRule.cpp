#include "../RuleSytem.h"
#include "CheckMinRestRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
//
//bool cmpp1(SharedPtr<CREW_MANDAY_FD> m1, SharedPtr<CREW_MANDAY_FD> m2) {
//	return m1->crewDateUtc < m2->crewDateUtc;
//}
//bool cmpp2(SharedPtr<CREW_MANDAY_CC_AM> m1, SharedPtr<CREW_MANDAY_CC_AM> m2) {
//	return m1->crewDateUtc < m2->crewDateUtc;
//}

bool CheckMinRestRule::CheckRule(vector<SharedPtr<ROSTER>>& rosters) const {
	
	if (rosters.size() == 0 || this->_ruleParams.empty())
		return true;

	bool bReturn = true;
	bool bCountPostRest, bBlankDay;

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

	time_t tempStart = rosters[0]->actEndUtc;
	const auto & crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
	int offsetMinutes = 0;
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	else
		base = _dbData->scenario.bases[0];
	this->_ruleViolation.SetParam("crew_id", crew->idCrew);
	
	for (const auto & ruleParam : this->_ruleParams) {
		int period = ruleParam._period;
		string unit = ruleParam._unit;
		int minLocalDayFree = ruleParam._minLocalDayFree;
		vector<string> daysOffs = ruleParam._daysOffAssignments;
		vector<string> daysOffGroups = ruleParam._daysOffAssignmentGroups;
		bCountPostRest = ruleParam._utilizePostDutyRest;
		bBlankDay = ruleParam._countBlankDay;
		

		time_t rollingWindow_start, rollingWindow_end;
		if (this->_application != ROSTER_OPTIMIZER && !rosters.empty())
		{
			rollingWindow_start = rosters[0]->actStrUtc;
			rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
		}
		else
		{
			rollingWindow_start = this->_dbData->scenario.startDtUTC;
			rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;
		}
		if (!ruleParam.MatchCrewQualification(crew, rollingWindow_start, rollingWindow_end))
			continue;
		
		/*int iRequiredLeave = 0, iRequiredUpRange = 9999;
		if (strAL.find("-") != string::npos)
		{
			string lowRange = strAL.substr(0, strAL.find("-"));
			iRequiredLeave = stoi(lowRange);
			iRequiredUpRange = stoi(strAL.substr(strAL.find("-") + 1));
		}
		else
			iRequiredLeave = stoi(strAL);*/
		
		map<time_t, time_t> mp;
		// Calendar Day
		if (unit == "CD") {
			mp = Utility::GetInstancePtr()->getDaysRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, period);
		}
		// Calendar Month
		else if (unit == "CM")
		{
			mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, period);
		}
		// Calendar Quarter
		else if (unit == "CQ") {
			mp = Utility::GetInstancePtr()->getQuarterRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, period);
		}
		auto& crewMandayCcAm = crew->mandayCcAmList;
		auto& crewMandayFd = crew->mandayFdList;
		for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
			time_t start = (*mp_it).first;
			time_t end = (*mp_it).second;

			int iLeave = 0;
			string rosterDuty;
			int iDaysOff;
			
			// ROSCRW-7253 7007 如果检查范围内没有RO优化的任务，则跳过
			if (this->_application == ROSTER_OPTIMIZER && !Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, start, end))
				continue;

			if (!bCountPostRest && !bBlankDay)
				iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end);
			else
				//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, rPostRest, start, end);
				iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, daysOffGroups, start, end, offsetMinutes, bBlankDay, bCountPostRest, this->_dbData->airportCodeMap, "", 1);

			// 如果按季度，需要根据manday数据去计算
			//if (unit == "CQ") {
				

				bool isFd = (crew->division == "P");
				time_t rosterStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->getStartTimeUtcAct(), offsetMinutes);
				time_t rosterEndUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->getEndTimeUtcAct(), offsetMinutes);
			/*	if (isFd)
					stable_sort(crewMandayFd.begin(), crewMandayFd.end(), cmpp1);
				else
					stable_sort(crewMandayCcAm.begin(), crewMandayCcAm.end(), cmpp2);*/

				if (isFd)
				{
					for (size_t j = 0; j < crewMandayFd.size(); j++)
					{
						//20180606 ain, mantis#3429, mpRange结束时间对比补齐 utc修正
						if (((crewMandayFd[j]->crewDateUtc >= mp_it->first && crewMandayFd[j]->crewDateUtc < rosterStartUtc)
							|| (crewMandayFd[j]->crewDateUtc <= mp_it->second && crewMandayFd[j]->crewDateUtc > rosterEndUtc)) && (crewMandayFd[j]->DAY_OFF == DAY_OFF_NOT_EXIST))
						{
							--iDaysOff;
						}
					}
				}
				else
				{
					for (size_t j = 0; j < crewMandayCcAm.size(); j++)
					{
						//20180606 ain, mantis#3429, mpRange结束时间对比补齐 utc修正
						if (((crewMandayCcAm[j]->crewDateUtc >= mp_it->first && crewMandayCcAm[j]->crewDateUtc < rosterStartUtc)
							|| (crewMandayCcAm[j]->crewDateUtc <= mp_it->second && crewMandayCcAm[j]->crewDateUtc > rosterEndUtc)) && (crewMandayCcAm[j]->DAY_OFF == DAY_OFF_NOT_EXIST))
						{
							--iDaysOff;
						}
					}
				}
			//}

			if (iDaysOff < minLocalDayFree)
			{
				this->_ruleViolation.SetRuleParam(ruleParam);
				this->_ruleViolation.SetParam("daysOff", to_string(iDaysOff));
				this->_ruleViolation.SetParam("minDaysOff", to_string(minLocalDayFree));
				this->_ruleViolation.SetParam("windows_start", to_string(start));
				this->_ruleViolation.SetParam("windows_end", to_string(end));
				this->_ruleViolation.SetParam("period", to_string(period));
				this->_ruleViolation.SetParam("unit", unit);
				ThrowRuleViolation();
				if (this->_application == ROSTER_OPTIMIZER) {
					return false;
				}
			}
		}
	}

	
	/*vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> daysOffs, restAssignments, leaveGroup;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if ((*assignment)->assignmentGroup == strDOAssGrp && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			daysOffs.push_back((*assignment)->assignemnt);
		}
		if ((*assignment)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			restAssignments.push_back((*assignment)->assignemnt);
		if ((*assignment)->assignmentGroup == "LEA" && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			leaveGroup.push_back((*assignment)->assignemnt);
	}*/
	

	return bReturn;
}

void CheckMinRestRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinRestRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

void CheckMinRestRule::ThrowRuleViolation() const {
	string errorMsg = "The number of days off ({0:daysOff}) must be at least {1:minDaysOff} in {2:period} {3:unit}.";
	errorMsg = StringUtils::Format(errorMsg, this->_ruleViolation.GetParam("daysOff"), 
		this->_ruleViolation.GetParam("minDaysOff"),
		this->_ruleViolation.GetParam("period"), this->_ruleViolation.GetParam("unit"));

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("windows_start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("windows_end"), 0);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->violation_msg = errorMsg;
	rv->idRule = _ruleParams[0].GetId();
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("MinDaysOff", _ruleViolation.GetParam("minDaysOff")));
	_ruleViolation.AddRuleViolations(rv);
}