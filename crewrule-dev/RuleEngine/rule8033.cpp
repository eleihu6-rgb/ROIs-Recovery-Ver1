#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"


//MAX_CONSECUTIVE_EARLY_DUTY
bool LegalityChecker::checkMaxConsecutiveEarlyDuty(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//DUTY START LOC,DUTY END LOC,MAX CONSECUTIVE TIMES,EXCLUDE ASSIGNMENT GROUP
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;

	string strMaxTimes, strStart, strEnd, strQualifiers = "*", strExcludedGroup = "*";
	bool isEod = false;
	//ALLOWED ASSIGNMENT GROUP,ALLOW BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "DUTY START LOC") {
			strStart = headeValue;
		}
		if (header == "DUTY END LOC") {
			strEnd = headeValue;
		}
		if (header == "TYPE") {
			isEod = (headeValue == "EOD");
		}
		if (header == "MAX CONSECUTIVE TIMES") {
			strMaxTimes = headeValue;
		}
		if (header == "(OR)EXCLUDE ASSIGNMENT GROUPS") {
			strExcludedGroup = headeValue;
		}
		if (header == "EXCLUDE QUALIFIERS") {
			strQualifiers = headeValue;
		}
	}

	vector<string> strExcludedGroups, strExcludeQualifiers;
	split(strExcludedGroup, '|', strExcludedGroups);
	split(strQualifiers, '|', strExcludeQualifiers);
	//boost::split(strExcludedGroups, strExcludedGroup, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(strExcludeQualifiers, strQualifiers, boost::is_any_of("|"), boost::token_compress_on);

	if (strExcludedGroups.size() == 0)
	{
		string errorStr = "Error rule parameter:" + string(singleRule->description) + +",para=" + strExcludedGroup;
		printf(errorStr.c_str());
		return true;
	}
	string dutyMsg;
	if (isEod)
		dutyMsg = " late ";
	else
		dutyMsg = " early ";

	int iMax = stoi(strMaxTimes);
	std::size_t iPos = strStart.find(":");
	int startLoc, endLoc;
	if (iPos != std::string::npos)
	{
		startLoc = stoi(strStart.substr(0, iPos)) * 60 + stoi(strStart.substr(iPos + 1));
		iPos = strEnd.find(":");
		if (iPos != std::string::npos)
		{
			endLoc = stoi(strEnd.substr(0, iPos)) * 60 + stoi(strEnd.substr(iPos + 1));
		}
		else
		{
			string errorStr = "Error rule parameter:" + strStart;
			printf(errorStr.c_str());
			return true;
		}
	}
	else
	{
		string errorStr = "Error rule parameter:" + strStart;
		printf(errorStr.c_str());
		return true;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> excludedGroup;
	if (strExcludedGroup != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
		{
			//if ((*assignment)->assignmentGroup == strExcludedGroup && (*assignment)->airline == airlinecode)
			if (this->_dbData->version == 3 || (*assignment)->airline == airlinecode)
			{
				if (std::find(strExcludedGroups.begin(), strExcludedGroups.end(), (*assignment)->assignmentGroup) != strExcludedGroups.end())
					excludedGroup.push_back((*assignment)->assignemnt);
			}
		}
	}

	//vector<Duty*> duties;
	time_t startUtc = 0, endUtc = 0;

	time_t firstDutyStart = 0;
	vector<Duty*> ealyDuties;
	map<long long, bool> preAssigned;
	bool isCovered = false;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
	
		if (!(*roster)->pairing)
			continue;
		string roster_type = (*roster)->duty;
		/*
		if ((strQualifiers != "*" &&
		std::find(strExcludeQualifiers.begin(), strExcludeQualifiers.end(), (*roster)->qualifier) != strExcludeQualifiers.end())
		||
		(strExcludedGroup != "*" &&
		std::find(excludedGroup.begin(), excludedGroup.end(), roster_type) != excludedGroup.end()))
		continue;

		if ((strQualifiers == "*")
		&&
		(strExcludedGroup != "*" &&
		std::find(excludedGroup.begin(), excludedGroup.end(), roster_type) != excludedGroup.end()))
		continue;

		if ((strQualifiers != "*" &&
		std::find(strExcludeQualifiers.begin(), strExcludeQualifiers.end(), (*roster)->qualifier) != strExcludeQualifiers.end())
		&&
		(strExcludedGroup == "*"))
		continue;
		*/
		//if ((*roster)->qualifier == "SH")
		//	printf("d");
		

		//if (strExcludedGroup == "*" ||
		//	std::find(excludedGroup.begin(), excludedGroup.end(), roster_type) == excludedGroup.end())
		{
			vector<Duty*> oldVector = (*roster)->pairing->getDutyVec();
			//std::copy(oldVector.begin(), oldVector.end(), std::back_inserter(duties));
			for (vector<Duty*>::iterator duty = oldVector.begin(); duty != oldVector.end(); ++duty)
			{
				if (strExcludedGroup != "*" &&
					std::find(excludedGroup.begin(), excludedGroup.end(), (*duty)->getAssignment()) != excludedGroup.end())
					continue;

				if (strQualifiers != "*" &&
					std::find(strExcludeQualifiers.begin(), strExcludeQualifiers.end(), (*duty)->getAssignment()) != strExcludeQualifiers.end())
					continue;
				if (duty == oldVector.begin())
					firstDutyStart = (*duty)->getStartTimeUtcAct();
				string dep = (*duty)->getDepStation();
				auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(dep);
				startUtc = (*duty)->getStartTimeUtcAct();
				endUtc = (*duty)->getEndTimeUtcAct();

				//mantis#1633，EOD判断为前一天到后一天时开始时间需要-24小时
				if (isEod)
					isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(endUtc, offsetMinutes, startLoc, endLoc);
				else
					isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(startUtc, offsetMinutes, startLoc, endLoc);

				if (isCovered)
				{
					ealyDuties.push_back((*duty));
					preAssigned.insert(pair<long long, bool>((*duty)->getPairingId(), (*roster)->source == "PA"));
				}

			}

			if (oldVector.size() == 0)
			{
				startUtc = (*roster)->actStrUtc;
				endUtc = (*roster)->restStrUtc;
				auto offsetMinutes = this->_dbData->getAirportOffsetMinutes((*roster)->location);
				bool isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(startUtc, offsetMinutes, startLoc, endLoc);

				if (isCovered)
				{
					if (_debug)
						printf("8033:early roster without duty\n");
					//to be changed later
				}
			}

		}
	}

	if ((int)ealyDuties.size() > iMax)
	{
		Duty* prevDuty = NULL;
		int iConsecutiveEarlyDutyies = 0;
		bool isAllPreAssigned = true;
		std::unordered_map<long long, int> pairingsForConsecutiveEarlyDuties;
		for (vector<Duty*>::iterator duty = ealyDuties.begin(); duty != ealyDuties.end(); ++duty)
		{
			if (duty == ealyDuties.begin())
				firstDutyStart = (*duty)->getStartTimeUtcAct();
			string dep = (*duty)->getDepStation();
			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(dep);
			startUtc = (*duty)->getStartTimeUtcAct();
			endUtc = (*duty)->getEndTimeUtcAct();

			bool isConsecutive = Utility::GetInstancePtr()->isTwoDutyConsecutives(prevDuty, (*duty), offsetMinutes, startLoc, endLoc);
			if (isConsecutive)
			{

				isAllPreAssigned = isAllPreAssigned && preAssigned.find((*duty)->getPairingId())->second;
				if (iConsecutiveEarlyDutyies == 0)
					firstDutyStart = (*duty)->getStartTimeUtcAct();
				iConsecutiveEarlyDutyies++;
				pairingsForConsecutiveEarlyDuties[(*duty)->getPairingId()] = 1;
			}
			else
			{
				if (iConsecutiveEarlyDutyies > iMax)
				{
					if (!((this->_application == ROSTER_OPTIMIZER) && (isAllPreAssigned || (int)pairingsForConsecutiveEarlyDuties.size() == 1)))
					{

						isValid = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;

						string msg = "The number of concecutive" + dutyMsg + "duties(" + Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies) + ") exceeds the maximum(";
						msg += strMaxTimes + ") with the exclusive qualifiers(" + strQualifiers + ") and definitions for the period(" + strStart + "-" + strEnd + ").";
						SharedPtr<CREW>& ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
						this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
						pCrew->isLegal = false;
						rv->startDTUtc = firstDutyStart;
						rv->endDTUtc = prevDuty == nullptr ? firstDutyStart: prevDuty->getEndTimeUtcAct();
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("dutyMsg", dutyMsg));
						rv->operation_result.insert(pair<string, string>("iConsecutiveEarlyDutyies", Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies)));
						rv->operation_result.insert(pair<string, string>("strMaxTimes", strMaxTimes));
						rv->operation_result.insert(pair<string, string>("strQualifiers", strQualifiers));
						rv->operation_result.insert(pair<string, string>("strStart", strStart));
						rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER)
							return isValid;
					}
				}
				isAllPreAssigned = true;
				iConsecutiveEarlyDutyies = 1;
				firstDutyStart = (*duty)->getStartTimeUtcAct();
				pairingsForConsecutiveEarlyDuties.clear();
				pairingsForConsecutiveEarlyDuties[(*duty)->getPairingId()] = 1;
			}
			prevDuty = (*duty);
		}

		if (iConsecutiveEarlyDutyies > iMax)
		{
			if ((this->_application == ROSTER_OPTIMIZER) && (isAllPreAssigned || (int)pairingsForConsecutiveEarlyDuties.size() == 1))
				return true;

			isValid = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;

			string msg = "The number of concecutive" + dutyMsg + "duties(" + Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies) + ") exceeds the maximum(";
			msg += strMaxTimes + ") with the exclusive qualifiers(" + strQualifiers + ") and definitions for the period((" + strStart + "-" + strEnd + ").";
			SharedPtr<CREW> ppCrew = this->_dbData->crewList[pCrew->crewIndex];
			this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;

			rv->startDTUtc = firstDutyStart;
			rv->endDTUtc = endUtc;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("dutyMsg", dutyMsg));
			rv->operation_result.insert(pair<string, string>("iConsecutiveEarlyDutyies", Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies)));
			rv->operation_result.insert(pair<string, string>("strMaxTimes", strMaxTimes));
			rv->operation_result.insert(pair<string, string>("strQualifiers", strQualifiers));
			rv->operation_result.insert(pair<string, string>("strStart", strStart));
			rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER)
				return isValid;
		}
	}

	return isValid;
}

bool LegalityChecker::checkMaxConsecutiveEarlyDutyForPairing(Pairing* pPairing, const DBRule* singleRule) {
	bool isValid = true;
	//DUTY START LOC,DUTY END LOC,MAX CONSECUTIVE TIMES,EXCLUDE ASSIGNMENT GROUP
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;

	string strMaxTimes, strStart, strEnd, strQualifiers = "*", strExcludedGroup = "*";
	bool isEod = false;
	//ALLOWED ASSIGNMENT GROUP,ALLOW BLANK DAY
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "DUTY START LOC") {
			strStart = headeValue;
		}
		if (header == "DUTY END LOC") {
			strEnd = headeValue;
		}
		if (header == "TYPE") {
			isEod = (headeValue == "EOD");
		}
		if (header == "MAX CONSECUTIVE TIMES") {
			strMaxTimes = headeValue;
		}
		if (header == "(OR)EXCLUDE ASSIGNMENT GROUPS") {
			strExcludedGroup = headeValue;
		}
		if (header == "EXCLUDE QUALIFIERS") {
			strQualifiers = headeValue;
		}
	}
	vector<string> strExcludedGroups, strExcludeQualifiers;
	split(strExcludedGroup, '|', strExcludedGroups);
	split(strQualifiers, '|', strExcludeQualifiers);
	//boost::split(strExcludedGroups, strExcludedGroup, boost::is_any_of("|"), boost::token_compress_on);
	//boost::split(strExcludeQualifiers, strQualifiers, boost::is_any_of("|"), boost::token_compress_on);

	if (strExcludedGroups.size() == 0)
	{
		string errorStr = "Error rule parameter:" + string(singleRule->description) + +",para=" + strExcludedGroup;
		printf(errorStr.c_str());
		return true;
	}
	string dutyMsg;
	if (isEod)
		dutyMsg = " late ";
	else
		dutyMsg = " early ";

	int iMax = stoi(strMaxTimes);

	if ((int)pPairing->getDutyVec().size() < iMax)
		return true;

	std::size_t iPos = strStart.find(":");
	int startLoc, endLoc;
	if (iPos != std::string::npos)
	{
		startLoc = stoi(strStart.substr(0, iPos)) * 60 + stoi(strStart.substr(iPos + 1));
		iPos = strEnd.find(":");
		if (iPos != std::string::npos)
		{
			endLoc = stoi(strEnd.substr(0, iPos)) * 60 + stoi(strEnd.substr(iPos + 1));
		}
		else
		{
			string errorStr = "Error rule parameter:" + strStart;
			printf(errorStr.c_str());
			return true;
		}
	}
	else
	{
		string errorStr = "Error rule parameter:" + strStart;
		printf(errorStr.c_str());
		return true;
	}

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	string airlinecode = this->_dbData->scenario.airline;
	vector<string> excludedGroup;
	if (strExcludedGroup != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
		{
			//if ((*assignment)->assignmentGroup == strExcludedGroup && (*assignment)->airline == airlinecode)
			if (this->_dbData->version == 3 || (*assignment)->airline == airlinecode)
			{
				if (std::find(strExcludedGroups.begin(), strExcludedGroups.end(), (*assignment)->assignmentGroup) != strExcludedGroups.end())
					excludedGroup.push_back((*assignment)->assignemnt);
			}
		}
	}
	/*if (strExcludedGroup != "*" &&
		std::find(excludedGroup.begin(), excludedGroup.end(), pPairing->getPrimeActivity()) != excludedGroup.end())
		return true;

	if (strQualifiers != "*" &&
		std::find(strExcludeQualifiers.begin(), strExcludeQualifiers.end(), pPairing->getQualifier()) != strExcludeQualifiers.end())
		return true;*/
	//vector<Duty*> duties;
	time_t startUtc = 0, endUtc = 0;

	time_t firstDutyStart;
	vector<Duty*> ealyDuties;
	map<long long, bool> preAssigned;
	bool isCovered = false;
	for (std::size_t i = 0; i < pPairing->getDutyVec().size(); i++)
	{

		//if (strExcludedGroup == "*" ||
		//	std::find(excludedGroup.begin(), excludedGroup.end(), roster_type) == excludedGroup.end())
		{
			//std::copy(oldVector.begin(), oldVector.end(), std::back_inserter(duties));
			const auto duty = pPairing->getDutyVec().at(i);
			if (strExcludedGroup != "*" &&
				std::find(excludedGroup.begin(), excludedGroup.end(), duty->getAssignment()) != excludedGroup.end())
				continue;

			if (strQualifiers != "*" &&
				std::find(strExcludeQualifiers.begin(), strExcludeQualifiers.end(), duty->getAssignment()) != strExcludeQualifiers.end())
				continue;
			if (i == 0)
				firstDutyStart = duty->getStartTimeUtcAct();
			string dep = duty->getDepStation();
			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(dep);
			startUtc = duty->getStartTimeUtcAct();
			endUtc = duty->getEndTimeUtcAct();

			//mantis#1633，EOD判断为前一天到后一天时开始时间需要-24小时
			if (isEod)
				isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(endUtc, offsetMinutes, startLoc, endLoc);
			else
				isCovered = Utility::GetInstancePtr()->isTimeCoveredInRange(startUtc, offsetMinutes, startLoc, endLoc);

			if (isCovered)
			{
				ealyDuties.push_back(duty);
				preAssigned.insert(pair<long long, bool>(duty->getPairingId(), pPairing->GetSource() == "PA"));
			}
		}
	}

	if ((int)ealyDuties.size() > iMax)
	{
		Duty* prevDuty = NULL;
		int iConsecutiveEarlyDutyies = 0;
		bool isAllPreAssigned = true;
		for (vector<Duty*>::iterator duty = ealyDuties.begin(); duty != ealyDuties.end(); ++duty)
		{
			if (duty == ealyDuties.begin())
				firstDutyStart = (*duty)->getStartTimeUtcAct();
			string dep = (*duty)->getDepStation();
			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(dep);
			startUtc = (*duty)->getStartTimeUtcAct();
			endUtc = (*duty)->getEndTimeUtcAct();

			bool isConsecutive = Utility::GetInstancePtr()->isTwoDutyConsecutives(prevDuty, (*duty), offsetMinutes, startLoc, endLoc);
			if (isConsecutive)
			{

				isAllPreAssigned = isAllPreAssigned && preAssigned.find((*duty)->getPairingId())->second;
				if (iConsecutiveEarlyDutyies == 0)
					firstDutyStart = (*duty)->getStartTimeUtcAct();
				iConsecutiveEarlyDutyies++;
			}
			else
			{
				if (iConsecutiveEarlyDutyies > iMax)
				{
					if (!((this->_application == ROSTER_OPTIMIZER) && (isAllPreAssigned)))
					{

						isValid = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();

						string msg = "Concecutive" + dutyMsg + "duties(" + Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies) + ") is more than max(";
						msg += strMaxTimes + ").";
						//this->setLegalityMessage(pPairing, singleRule, msg);
						rv->startDTUtc = firstDutyStart;
						rv->endDTUtc = prevDuty == nullptr ? firstDutyStart : prevDuty->getEndTimeUtcAct();
						rv->violation_msg = msg;
						rv->pairingId = pPairing->getDbId();
						rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("dutyMsg", dutyMsg));
						rv->operation_result.insert(pair<string, string>("iConsecutiveEarlyDutyies", Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies)));
						rv->operation_result.insert(pair<string, string>("strMaxTimes", strMaxTimes));
						rv->operation_result.insert(pair<string, string>("strQualifiers", strQualifiers));
						rv->operation_result.insert(pair<string, string>("strStart", strStart));
						rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER)
							return isValid;
					}
				}
				isAllPreAssigned = true;
				iConsecutiveEarlyDutyies = 1;
				firstDutyStart = (*duty)->getStartTimeUtcAct();
			}
			prevDuty = (*duty);
		}

		if (iConsecutiveEarlyDutyies > iMax)
		{
			if ((this->_application == ROSTER_OPTIMIZER) && (isAllPreAssigned))
				return true;

			isValid = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();

			string msg = "Concecutive" + dutyMsg + "duties(" + Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies) + ") is more than max(";
			msg += strMaxTimes + ").";
			//this->setLegalityMessage(pPairing, singleRule, msg);

			rv->startDTUtc = firstDutyStart;
			rv->endDTUtc = endUtc;
			rv->violation_msg = msg;
			rv->pairingId = pPairing->getDbId();
			rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("dutyMsg", dutyMsg));
			rv->operation_result.insert(pair<string, string>("iConsecutiveEarlyDutyies", Utility::GetInstancePtr()->ToString(iConsecutiveEarlyDutyies)));
			rv->operation_result.insert(pair<string, string>("strMaxTimes", strMaxTimes));
			rv->operation_result.insert(pair<string, string>("strQualifiers", strQualifiers));
			rv->operation_result.insert(pair<string, string>("strStart", strStart));
			rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER)
				return isValid;
		}
	}

	return isValid;
}
