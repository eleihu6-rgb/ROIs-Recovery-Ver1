#pragma once

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
#include "basicCalculation.h"

void updatePatternStat(SharedPtr<CREW> crew, vector<SharedPtr<ROSTER>>& rosters, const vector<DBRule>& rules, bool isAddRsoter, time_t start, time_t end)
{
	if (rosters.size() == 0)
		return;
	string ruleParams, att;
	// boolean isMatch = false;
	bool isMatch = false;

	int ret = 0, func = 0;
	//BASES,RANKS,FLEETS,CREW TEAMS,ATTRIBUTE,UNIT,PERIOD,MAX TIMES
	string strBases, strRanks, strFleets, strPeriod, strUnit, strTeams = "*", strAttributes, strMax;
	for (vector<DBRule>::const_iterator rule = rules.begin(); rule != rules.end(); ++rule)
	{
		func = rule->function;
		if (func != RULES::MAX_PTN_IN_SCENARIO)
			continue;
		isMatch = false;

		std::stringstream ss;
		ss << rule->idRule << "|" << rule->tableNum << "|" << rule->rowNum;
		ruleParams = ss.str();
		auto& parameter = rule->params;
		//BASES,RANKS,FLEETS,CREW TEAMS,ATTRIBUTE,MAX LIMITS,MIN SPACE,UNIT
		ret = retriveRuleParameter(parameter, "BASES", strBases, true, false); CHECK_RULE_PARAM(ret, func, "BASES");
		ret = retriveRuleParameter(parameter, "RANKS", strRanks, true, false); CHECK_RULE_PARAM(ret, func, "RANKS");
		ret = retriveRuleParameter(parameter, "FLEETS", strFleets, true, false); CHECK_RULE_PARAM(ret, func, "FLEETS");
		ret = retriveRuleParameter(parameter, "CREW TEAMS", strTeams, true, false); CHECK_RULE_PARAM(ret, func, "CREW TEAMS");
		ret = retriveRuleParameter(parameter, "ATTRIBUTES", strAttributes, true, false); CHECK_RULE_PARAM(ret, func, "ATTRIBUTES");
		//ret = retriveRuleParameter(parameter, "PERIOD", strPeriod, true, false); CHECK_RULE_PARAM(ret, func, "PERIOD");
		//ret = retriveRuleParameter(parameter, "UNIT", strUnit, true, false); CHECK_RULE_PARAM(ret, func, "UNIT");
		//ret = retriveRuleParameter(parameter, "MAX LIMITS", strMax, true, false); CHECK_RULE_PARAM(ret, func, "MAX LIMITS");
		ss.clear();
		if (strAttributes == "*")
			continue;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			isMatch = false;
			if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", (*roster)->actStrUtc, (*roster)->actRestStrUtc))
				continue;
			if (start != 0 && end != 0)
			{
				//if (!Utility::GetInstancePtr()->isTimeOverlap(start, end, (*roster)->actStrUtc, (*roster)->actRestStrUtc))
				if (!((*roster)->actStrUtc >= start && (*roster)->actStrUtc <= end))
					continue;
			}
			if (!(*roster)->pairing)
				continue;
			att = (*roster)->pairing->getAttribute();
			//
			/*vector<Segment*>segs = (*roster)->pairing->getSegments();
			bool isFindAttribute = false;
			string attTemp = ".";
			for (auto& seg : segs)
			{
				attTemp += seg->getFlightNumber();
				attTemp += ".";
			}
			if (attTemp.find(strAttributes) != string::npos)
			{
				isFindAttribute = true;
			}
			if (strAttributes != "*" && isFindAttribute)*/
		    //
			if (strAttributes != "*" && att.find(strAttributes) != string::npos)
			{
				isMatch = true;
			}

			if (isMatch)
			{
				if (isAddRsoter)
					RuleStatistics::GetInstancePtr()->addActualPatternInScenario(ruleParams, (*roster), 1);
				else
					RuleStatistics::GetInstancePtr()->addActualPatternInScenario(ruleParams, (*roster), -1);
			}
		}

	}
}


//MAX_PTN_IN_SCENARIO
bool LegalityChecker::checkMaxPatternInScenario(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	//if (this->_application != ROSTER_OPTIMIZER)
	//	return true;
	bool bReturn = true;
	std::stringstream  ss;
	string strBases, strRanks, strFleets, strSpace, strUnit, strTeams = "*", strAttributes, strMax;
	ss << singleRule->idRule << "|" << singleRule->tableNum << "|" << singleRule->rowNum;
	string ruleParams = ss.str();
	auto& parameter = singleRule->params;
	int func = singleRule->function;
	int ret = retriveRuleParameter(parameter, "BASES", strBases, true, false); CHECK_RULE_PARAM(ret, func, "BASES");
	ret = retriveRuleParameter(parameter, "RANKS", strRanks, true, false); CHECK_RULE_PARAM(ret, func, "RANKS");
	ret = retriveRuleParameter(parameter, "FLEETS", strFleets, true, false); CHECK_RULE_PARAM(ret, func, "FLEETS");
	ret = retriveRuleParameter(parameter, "CREW TEAMS", strTeams, true, false); CHECK_RULE_PARAM(ret, func, "CREW TEAMS");
	ret = retriveRuleParameter(parameter, "ATTRIBUTES", strAttributes, true, false); CHECK_RULE_PARAM(ret, func, "ATTRIBUTES");
	ret = retriveRuleParameter(parameter, "MIN SPACE", strSpace, true, false); CHECK_RULE_PARAM(ret, func, "PERIOD");
	ret = retriveRuleParameter(parameter, "UNIT", strUnit, true, false); CHECK_RULE_PARAM(ret, func, "UNIT");
	ret = retriveRuleParameter(parameter, "MAX LIMITS", strMax, true, true); CHECK_RULE_PARAM(ret, func, "MAX LIMITS"); //Max Limits

	if (strUnit != "CD" && strUnit != "RH")
	{
		printf("Rule-8073:Exception:un-supported paramters.\n");
		return true;
	}

	if (strAttributes == "*")
		return true;
	if (pCrew->crewIndex < 0)
		return false;
	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];

	if (this->GetApplication() == ROSTER_OPTIMIZER) {
		if (pCrew->RosterIndex < 0) {
			return false;
		}
		SharedPtr<ROSTER> roster = crew->rosterList[pCrew->RosterIndex];
		if (roster->pairing == nullptr) {
			Logger::getRuleLogger()->error("[rule8073] crew ({}) rosterList[{}] pairing is null.", crew->idCrew, pCrew->RosterIndex);
			return true;
		}

		if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", roster->actStrUtc, roster->actRestStrUtc))
			return true;

		//if (!Utility::GetInstancePtr()->isTimeOverlap(_dbData->scenario.startDtUTC, _dbData->scenario.endDtUTC + 24 * 3600, roster->actStrUtc, roster->actStrUtc))
		if (!(roster->actStrUtc >= _dbData->scenario.startDtUTC && roster->actStrUtc <= _dbData->scenario.endDtUTC + 24 * 3600))
			return true;

		string att = roster->pairing->getAttribute();
		//
		/*vector<Segment*>segs = roster->pairing->getSegments();
		cout << "pgDbid: " << roster->pairing->getDbid() << endl;
		bool isFindAttribute = false;
		string attTemp = ".";
		for (auto& seg : segs)
		{
			attTemp += seg->getFlightNumber();
			attTemp += ".";
		}
		if (attTemp.find(strAttributes) != string::npos)
		{
			isFindAttribute = true;
		}
		if (strAttributes != "*" && isFindAttribute)*/
		//	
		if (strAttributes != "*" && att.find(strAttributes) != string::npos)
		{
			int iMax = stoi(strMax);
			int iActual = RuleStatistics::GetInstancePtr()->getActualPatternInScenario(ruleParams);
			//cout << "iActual: " << iActual << endl;
			if (iActual > iMax)
			{
				string msg = "The number of pairings(" + Utility::GetInstancePtr()->iToa(iActual) + ") with attribute(" + strAttributes + ") in this scenario exceeds (" + strMax + ").";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(roster, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = roster->rosterId;
				rv->pairingId = roster->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = roster->actStrUtc;
				rv->endDTUtc = roster->actRestStrUtc;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iActual", Utility::GetInstancePtr()->iToa(iActual)));
				rv->operation_result.insert(pair<string, string>("strAttributes", strAttributes));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->violation_msg = msg;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
			vector<SharedPtr<ROSTER>> patterns = RuleStatistics::GetInstancePtr()->getPatternListInScenario(ruleParams);
			int iSpace = stoi(strSpace);
			if (iSpace > 0 && patterns.size() > 1)
			{
				//iSpace = iSpace * 24 * 3600;
				int offsetMinutes;
				time_t must_later_than;
				for (std::size_t j = 0; j + 1 < patterns.size(); j++)
				{
					if (strUnit == "CD")
					{
						offsetMinutes = this->_dbData->getAirportOffsetMinutes(patterns[j]->location);
						must_later_than = Utility::GetInstancePtr()->getLocalDayStartInUTC(patterns[j]->actStrUtc, offsetMinutes) + (iSpace + 1) * 24 * 3600;
					}
					else if (strUnit == "RH")
					{
						must_later_than = patterns[j]->actStrUtc + iSpace * 3600;
					}
					if (patterns[j + 1]->actStrUtc < must_later_than)
					{
						if (this->GetApplication() == ROSTER_OPTIMIZER)
						{
							if (!(patterns[j]->rosterId == roster->rosterId || patterns[j + 1]->rosterId == roster->rosterId))
								continue;
						}
						string msg = "The spacing between two rosters[" + Utility::GetInstancePtr()->llToa(patterns[j]->rosterId) + ",";
						msg += Utility::GetInstancePtr()->llToa(patterns[j + 1]->rosterId) + "] with attribute(" + strAttributes + ") is less than ";
						msg += strSpace + strUnit + ".";
						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(roster, pCrew, singleRule, msg);
						pCrew->isLegal = false;
						bReturn = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->rosterId = roster->rosterId;
						rv->pairingId = roster->pairId;
						//rv->dutySequenceNumber = (*duty)->getDutySegNum();
						//rv->segmentId = (*segment)->getDBId();
						rv->startDTUtc = roster->actStrUtc;
						rv->endDTUtc = roster->actRestStrUtc;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->llToa(patterns[j]->rosterId)));
						rv->operation_result.insert(pair<string, string>("nextRosterId", Utility::GetInstancePtr()->llToa(patterns[j + 1]->rosterId)));
						rv->operation_result.insert(pair<string, string>("strAttributes", strAttributes));
						rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
						rv->operation_result.insert(pair<string, string>("strUnit", strUnit));
						rv->violation_msg = msg;
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}

					}
				}
			}
		}
	}
	else {
		for (const auto & roster : crew->rosterList) {
			
			if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", roster->actStrUtc, roster->actRestStrUtc))
				continue;

			//if (!Utility::GetInstancePtr()->isTimeOverlap(_dbData->scenario.startDtUTC, _dbData->scenario.endDtUTC + 24 * 3600, roster->actStrUtc, roster->actStrUtc))
			if (!(roster->actStrUtc >= _dbData->scenario.startDtUTC && roster->actStrUtc <= _dbData->scenario.endDtUTC + 24 * 3600))
				continue;
			if (!roster->pairing)
				continue;
			string att = roster->pairing->getAttribute();
			//
			/*vector<Segment*>segs = roster->pairing->getSegments();
			cout << "pgDbid: " << roster->pairing->getDbid() << endl;
			bool isFindAttribute = false;
			string attTemp = ".";
			for (auto& seg : segs)
			{
				attTemp += seg->getFlightNumber();
				attTemp += ".";
			}
			if (attTemp.find(strAttributes) != string::npos)
			{
				isFindAttribute = true;
			}
			if (strAttributes != "*" && isFindAttribute)*/
			//	
			if (strAttributes != "*" && att.find(strAttributes) != string::npos)
			{
				int iMax = stoi(strMax);
				int iActual = RuleStatistics::GetInstancePtr()->getActualPatternInScenario(ruleParams);
				//cout << "iActual: " << iActual << endl;
				if (iActual > iMax)
				{
					string msg = "The number of pairings(" + Utility::GetInstancePtr()->iToa(iActual) + ") with attribute(" + strAttributes + ") in this scenario exceeds (" + strMax + ").";
					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(roster, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = roster->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = roster->actStrUtc;
					rv->endDTUtc = roster->actRestStrUtc;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("iActual", Utility::GetInstancePtr()->iToa(iActual)));
					rv->operation_result.insert(pair<string, string>("strAttributes", strAttributes));
					rv->operation_result.insert(pair<string, string>("strMax", strMax));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
				}
				vector<SharedPtr<ROSTER>> patterns = RuleStatistics::GetInstancePtr()->getPatternListInScenario(ruleParams);
				int iSpace = stoi(strSpace);
				if (iSpace > 0 && patterns.size() > 1)
				{
					//iSpace = iSpace * 24 * 3600;
					int offsetMinutes;
					time_t must_later_than;
					for (std::size_t j = 0; j + 1 < patterns.size(); j++)
					{
						if (strUnit == "CD")
						{
							offsetMinutes = this->_dbData->getAirportOffsetMinutes(patterns[j]->location);
							must_later_than = Utility::GetInstancePtr()->getLocalDayStartInUTC(patterns[j]->actStrUtc, offsetMinutes) + (iSpace + 1) * 24 * 3600;
						}
						else if (strUnit == "RH")
						{
							must_later_than = patterns[j]->actStrUtc + iSpace * 3600;
						}
						if (patterns[j + 1]->actStrUtc < must_later_than)
						{
							if (this->GetApplication() == ROSTER_OPTIMIZER)
							{
								if (!(patterns[j]->rosterId == roster->rosterId || patterns[j + 1]->rosterId == roster->rosterId))
									continue;
							}
							string msg = "The spacing between two rosters[" + Utility::GetInstancePtr()->llToa(patterns[j]->rosterId) + ",";
							msg += Utility::GetInstancePtr()->llToa(patterns[j + 1]->rosterId) + "] with attribute(" + strAttributes + ") is less than ";
							msg += strSpace + strUnit + ".";
							pCrew->legalMessage.push_back(msg);
							this->setLegalityMessage(roster, pCrew, singleRule, msg);
							pCrew->isLegal = false;
							bReturn = false;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
							rv->rosterId = roster->rosterId;
							rv->pairingId = roster->pairId;
							//rv->dutySequenceNumber = (*duty)->getDutySegNum();
							//rv->segmentId = (*segment)->getDBId();
							rv->startDTUtc = roster->actStrUtc;
							rv->endDTUtc = roster->actRestStrUtc;
							rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->llToa(patterns[j]->rosterId)));
							rv->operation_result.insert(pair<string, string>("nextRosterId", Utility::GetInstancePtr()->llToa(patterns[j + 1]->rosterId)));
							rv->operation_result.insert(pair<string, string>("strAttributes", strAttributes));
							rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
							rv->operation_result.insert(pair<string, string>("strUnit", strUnit));
							rv->violation_msg = msg;
							this->addRuleViolations(rv, singleRule);
							if (this->GetApplication() == ROSTER_OPTIMIZER) {
								return false;
							}

						}
					}
				}
			}
		}
	}
	

	return bReturn;
}
