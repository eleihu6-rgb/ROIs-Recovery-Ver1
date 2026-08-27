#pragma once

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"


//MAX_CONSECUTIVE_LATE_DUTY = 8066,  //deprecated, replaced by 8033?
bool LegalityChecker::checkMaxLateDuties(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMaxLateDuties");

	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string rMax, rBase = "*", rRank = "*", rFleet = "*", rGroup = "FLY|RB", rStart, rEnd;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "RANK")
			rRank = headeValue;
		if (header == "BASE")
			rBase = headeValue;
		if (header == "FLEET")
			rFleet = headeValue;
		if (header == "MAX CONSECUTIVE LATE DUTIES")
			rMax = headeValue;
		if (header == "LATE DUTY START LOC")
			rStart = headeValue;
		if (header == "LATE DUTY END LOC")
			rEnd = headeValue;
		if (header == "ROSTER ASSIGNMENT GROUP")
			rGroup = headeValue;
	}

	vector<string> strGroups;
	split(rGroup, '|', strGroups);
	//	boost::split(strGroups, rGroup, boost::is_any_of("|"), boost::token_compress_on);

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() == 0)
		return true;

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
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBase, rRank, rFleet,"*", "*", lCheckedStart, lCheckedEnd))
		return true;

	string airline = this->_dbData->scenario.airline;
	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> restAssignments;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == "REST" && (this->_dbData->version == 3 || (*assign)->airline == airline))
			restAssignments.push_back((*assign)->assignemnt);
	}

	int iMax = stoi(rMax);
	std::size_t iPos = rStart.find(":");
	int startLoc, endLoc;
	if (iPos != std::string::npos)
	{
		startLoc = stoi(rStart.substr(0, iPos)) * 60 + stoi(rStart.substr(iPos + 1));
		iPos = rEnd.find(":");
		if (iPos != std::string::npos)
		{
			endLoc = stoi(rEnd.substr(0, iPos)) * 60 + stoi(rEnd.substr(iPos + 1));
		}
		else
		{
			string errorStr = "Error rule parameter:" + rEnd;
			printf(errorStr.c_str());
			return true;
		}
	}
	else
	{
		string errorStr = "Error rule parameter:" + rStart;
		printf(errorStr.c_str());
		return true;
	}

	string depStation, dutyCode;
	time_t dutyStart, dutyEnd, firstStart, lastEnd;
	int numOfLate = 0;
	for (std::size_t i = 0; i < rosters.size(); i++)
	{
		if (!(rosters[i]->pairing))
			continue;

		bool bReset = false;
		dutyCode = rosters[i]->duty;
		bool isRest = find(restAssignments.begin(), restAssignments.end(), dutyCode) != restAssignments.end();
		if (isRest)
			continue;
		if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, rosters[i]->actStrUtc, rosters[i]->actRestStrUtc)))
			continue;
		if (find(strGroups.begin(), strGroups.end(), dutyCode) == strGroups.end())
		{
			bReset = true;
		}
		else
		{
			vector<Duty *> duties = rosters[i]->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
			{
				depStation = (*duty)->getDepStation();
				auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(depStation);
				dutyStart = (*duty)->getStartTimeUtcAct();
				dutyEnd = (*duty)->getEndTimeUtcAct();
				if (Utility::GetInstancePtr()->isTimesCoveredInRange(dutyStart, dutyEnd, offsetMinutes, startLoc, endLoc))
				{
					numOfLate++;
					if (numOfLate == 1)
						firstStart = dutyStart;
					lastEnd = dutyEnd;
				}
				else
				{
					bReset = true;
				}
			}
		}

		if (numOfLate > iMax)
		{
			if (this->_application == ROSTER_OPTIMIZER)
			{
				if (!hasOptimizedNewRosterInRange(rosters, dutyStart, lastEnd))
				{
					continue;
				}
			}
			bReturn = false;
			string msg = "The number of consecutive late duties(" + Utility::GetInstancePtr()->ToString(numOfLate) + ") exceeds the maximum limitation(" + rMax + ")";
			msg += " with definition(Start Location=" + rStart + ",End Location=" + rEnd + ").";
			this->setLegalityMessage(rosters[i], pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->rosterId = rosters[i]->rosterId;
			//rv->pairingId = (*roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = firstStart;
			rv->endDTUtc = lastEnd;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("numOfLate", Utility::GetInstancePtr()->ToString(numOfLate)));
			rv->operation_result.insert(pair<string, string>("rMax", rMax));
			rv->operation_result.insert(pair<string, string>("rStart", rStart));
			rv->operation_result.insert(pair<string, string>("rEnd", rEnd));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
		}
		if (bReset)
			numOfLate = 0;
	}

	return bReturn;
}


//MAX_DOWNGRADE_ON_COF = 8050, //deprecated, replaced by 8069
bool LegalityChecker::checkMaxDowngradeOnFlight(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strFlightFleet, strRank, strMax, strActingRank = "*";
	bool isDirectional = true;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "ACTING RANK")
			strActingRank = headeValue;
		if (header == "ACTIVE RANK")
			strRank = headeValue;
		if (header == "FLEET")
			strFlightFleet = headeValue;
		if (header == "MAX LIMITS")
			strMax = headeValue;
	}

	vector<string> fleets;
	split(strFlightFleet, '|', fleets);
	//	boost::split(fleets, strFlightFleet, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<RANK>& basicRanks = this->_dbData->rankList;
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string crewId = crew->idCrew;
	int iMax = stoi(strMax);
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	string actingRank;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
			continue;

		if (strActingRank != "*" && strActingRank != (*roster)->actingRank)
			continue;

		if ((*roster)->pairing)
		{
			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty*>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				Duty::DUTY_TYPE dt = (*duty)->getType();
				if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR)
					continue;
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{
					if (!(*segment)->getIsOperating())
						continue;
					string fleet = (*segment)->getFleetCD();
					if ((strFlightFleet != "*") && (std::find(fleets.begin(), fleets.end(), fleet) == fleets.end()))
						continue;

					long long flt_id = (*segment)->getDBId();
					int downgradeNumofCrew = 0;
					if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
					{
						vector<SharedPtr<CrewOnFlight>>& crews = crewsOnFlt.find(flt_id)->second;

						for (vector<SharedPtr<CrewOnFlight>>::iterator crew_it = crews.begin(); crew_it != crews.end(); ++crew_it)
						{
							vector<SharedPtr<CREW_RANK>>& ranks = (*crew_it)->crew->rankList;
							actingRank = (*crew_it)->actingRank;
							for (vector<SharedPtr<CREW_RANK>>::iterator rank = ranks.begin(); rank != ranks.end(); ++rank)
							{
								if (((*rank)->effUtc > (*segment)->getStartTimeUtcAct()) || ((*rank)->rank != strRank && strRank != "*"))
									continue;

								if ((*rank)->expUtc == NULL || (*rank)->expUtc < 0 || (*rank)->expUtc>(*segment)->getStartTimeUtcAct())
								{
									if ((actingRank != (*rank)->rank) && (actingRank == strActingRank || strActingRank == "*" || strRank == "*"))
									{
										bool isDown = Utility::GetInstancePtr()->isDownGrade(basicRanks, this->_dbData->scenario.airline, (*rank)->rank, actingRank);
										if (isDown)
											downgradeNumofCrew++;
									}
								}
							}
						}
					}

					if (downgradeNumofCrew > iMax)
					{
						if (this->GetApplication() == ROSTER_OPTIMIZER && (!((*roster)->needRuleCheck)))
							continue;
						//mantis#1340, 修正violation msg, acting rank (xx) -> mayfly position
						string msg = "The number of downgrade crew(" + Utility::GetInstancePtr()->ToString(downgradeNumofCrew) + ") in the mayfly position exceeds the maximum limitation(";
						msg += strMax + ") for active rank(" + strRank + "),acting rank(" + strActingRank + ") and fleet(" + strFlightFleet + ")";
						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage((*segment), singleRule, msg);
						bReturn = false;
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->rosterId = (*roster)->rosterId;
						rv->pairingId = (*roster)->pairId;
						rv->dutySequenceNumber = (*duty)->getDutySegNum();
						rv->segmentId = (*segment)->getDBId();
						rv->startDTUtc = (*segment)->getStartTimeUtcAct();
						rv->endDTUtc = (*segment)->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("downgradeNumofCrew", Utility::GetInstancePtr()->ToString(downgradeNumofCrew)));
						rv->operation_result.insert(pair<string, string>("strMax", strMax));
						rv->operation_result.insert(pair<string, string>("strRank", strRank));
						rv->operation_result.insert(pair<string, string>("strActingRank", strActingRank));
						rv->operation_result.insert(pair<string, string>("strFlightFleet", strFlightFleet));
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

	return bReturn;
}


//MAX_ASSIGNMENT_GROUP = 8025,  //deprecated, replaced by 8071
bool LegalityChecker::checkMaxAssignmentGroup(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMaxAssignmentGroup");

	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string airlinecode = this->_dbData->scenario.airline;
	string rGroup, rMaxAssignment, rPeriod, rUnit, rMinAssignment;
	//ASSIGNMENT GROUP,MAX ASSIGNMENT,PERIOD,UNIT
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "ASSIGNMENT GROUP")
			rGroup = headeValue;
		if (header == "MAX ASSIGNMENT")
			rMaxAssignment = headeValue;
		if (header == "PERIOD")
			rPeriod = headeValue;
		if (header == "UNIT")
			rUnit = headeValue;
	}
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	time_t rollingWindow_start, rollingWindow_end;
	if (this->GetApplication() != ROSTER_OPTIMIZER && !rosters.empty())
	{
		rollingWindow_start = rosters[0]->actStrUtc;
		rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
	}
	else
	{
		rollingWindow_start = this->_dbData->scenario.startDtUTC;
		rollingWindow_end = this->_dbData->scenario.endDtUTC;
	}
	int iMonths = stoi(rPeriod);
	int iMaxAssignment = stoi(rMaxAssignment);
	if (rosters.size() == 0)
		return true;
	time_t tempStart = rosters[0]->actEndUtc;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(this->_dbData->crewList[pCrew->crewIndex]->baseList, tempStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> assignGroup;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if ((*assignment)->assignmentGroup == rGroup && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			assignGroup.push_back((*assignment)->assignemnt);
		}
	}
	if (rUnit == "CM")
	{
		map<time_t, time_t> mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end + 24 * 3600, offsetMinutes, iMonths);
		for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); mp_it++)
		{
			time_t start = (*mp_it).first;
			time_t end = (*mp_it).second;
			int	iAssignments = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, assignGroup, start, end);
			if (iAssignments > iMaxAssignment)
			{
				pCrew->isLegal = false;
				string msg = "The number of assignments(" + Utility::GetInstancePtr()->ToString(iAssignments) + ") must be less than " + rMaxAssignment + ".";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
				bReturn = false;
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				//rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = start;
				rv->endDTUtc = end;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("assignmentGroup", rGroup));
				rv->operation_result.insert(pair<string, string>("iAssignments", Utility::GetInstancePtr()->ToString(iAssignments)));
				rv->operation_result.insert(pair<string, string>("rMaxAssignment", rMaxAssignment));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
		}
	}

	return bReturn;
}


//MIN_PROBATION_PERRANK = 8021, //deprecated, replaced by 8069
bool LegalityChecker::checkMinProbationPerRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;

	string rAttribute, rFleet, rProbation, rRank, rMinProb;
	//FLEET,PATTERN ATTRIBUTE,RANK,MIN OF EXPERIENCE,EXPERIENED DAYS
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "PATTERN ATTRIBUTE")
			rAttribute = headeValue;
		if (header == "FLEETS")
			rFleet = headeValue;
		if (header == "ACTING RANKS")
			rRank = headeValue;
		if (header == "EXPERIENED DAYS")
			rProbation = headeValue;
		if (header == "MIN OF EXPERIENCE")
			rMinProb = headeValue;
	}
	vector<string> sFleets;
	//	boost::split(sFleets, rFleet, boost::is_any_of("|"), boost::token_compress_on);
	vector<string> sRanks;
	//	boost::split(sRanks, rRank, boost::is_any_of("|"), boost::token_compress_on);
	vector<string> sProbs;
	//	boost::split(sProbs, rProbation, boost::is_any_of("|"), boost::token_compress_on);
	split(rFleet, '|', sFleets);
	split(rRank, '|', sRanks);
	split(rProbation, '|', sProbs);
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	int iMin = stoi(rMinProb);
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
			continue;

		if ((*roster)->pairing)
		{
			string attributes = (*roster)->pairing->getAttribute();
			if (rAttribute != "*" && attributes.find(rAttribute) == string::npos)
			{
				continue;
			}
			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
			{
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{
					long long flt_id = (*segment)->getDBId();
					string fleet = (*segment)->getFleetCD();
					if (rFleet != "*" && find(sFleets.begin(), sFleets.end(), fleet) == sFleets.end())
						continue;
					if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
					{
						vector<SharedPtr<CrewOnFlight>> crews = crewsOnFlt.find(flt_id)->second;
						//crews.push_back(&(this->_dbData->crewList[pCrew->crewIndex]));
						if ((int)crews.size() < iMin)
							continue;
						int num = getNumberOfProbationers(crews, sRanks, sProbs, (*segment)->getStartTimeUtcAct());
						auto& plans = (*segment)->getPlanComposition();

						int numberOfPlanned = getNumberOfPlannedCrewPerRank(plans, sRanks);
						int numberOfFilled = getNumberOfFilledCrewPerRank(crews, sRanks, (*segment)->getStartTimeUtcAct());

						if ((num < iMin) && (iMin - num > numberOfPlanned - numberOfFilled) && (numberOfPlanned > 0))
						{
							string msg = "The number of experienced crew members per rank(" + rRank + ") on flight must be at least " + rMinProb + ".";
							pCrew->legalMessage.push_back(msg);
							this->setLegalityMessage((*segment), singleRule, msg);
							pCrew->isLegal = false;
							bReturn = false;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
							rv->rosterId = (*roster)->rosterId;
							rv->pairingId = (*roster)->pairId;
							rv->dutySequenceNumber = (*duty)->getDutySegNum();
							rv->segmentId = (*segment)->getDBId();
							rv->startDTUtc = (*segment)->getStartTimeUtcAct();
							rv->endDTUtc = (*segment)->getEndTimeUtcAct();
							rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("rRank", rRank));
							rv->operation_result.insert(pair<string, string>("rMinProb", rMinProb));
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


//MAX_PROBATION_PERRANK = 8020, //deprecated, replaced by 8069
bool LegalityChecker::checkMaxProbationPerRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;

	string rAttribute, rFleet, rProbation, rRank, rMaxProb;
	//FLEET,PATTERN ATTRIBUTE,RANK,MAX OF PROBATION,PROBATION DAYS
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "PATTERN ATTRIBUTE")
			rAttribute = headeValue;
		if (header == "FLEETS")
			rFleet = headeValue;
		if (header == "ACTING RANKS")
			rRank = headeValue;
		if (header == "PROBATION DAYS")
			rProbation = headeValue;
		if (header == "MAX OF PROBATION")
			rMaxProb = headeValue;
	}
	vector<string> sFleets;
	split(rFleet, '|', sFleets);
	//	boost::split(sFleets, rFleet, boost::is_any_of("|"), boost::token_compress_on);
	vector<string> sRanks;
	split(rRank, '|', sRanks);
	//	boost::split(sRanks, rRank, boost::is_any_of("|"), boost::token_compress_on);
	vector<string> sProbs;
	split(rProbation, '|', sProbs);
	//	boost::split(sProbs, rProbation, boost::is_any_of("|"), boost::token_compress_on);


	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	int iMax = stoi(rMaxProb);
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		if ((*roster)->needRuleCheck && (*roster)->pairing)
		{
			string attributes = (*roster)->pairing->getAttribute();
			if (rAttribute != "*" && attributes.find(rAttribute) == string::npos)
			{
				continue;
			}
			vector<Duty *> duties = (*roster)->pairing->getDutyVec();
			for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
			{
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
				{
					long long flt_id = (*segment)->getDBId();
					string fleet = (*segment)->getFleetCD();
					if (rFleet != "*" && find(sFleets.begin(), sFleets.end(), fleet) != sFleets.end())
						continue;
					if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
					{
						vector<SharedPtr<CrewOnFlight>>& crews = crewsOnFlt.find(flt_id)->second;
						if ((int)crews.size() < iMax)
							continue;
						//crews.push_back(&(this->_dbData->crewList[pCrew->crewIndex]));
						int num = getNumberOfProbationers(crews, sRanks, sProbs, (*segment)->getStartTimeUtcAct());
						if (num > iMax)
						{
							string msg = "The number of probationary crew members per rank(" + rRank + ") on flight exceeds the maximum allowed " + rMaxProb + ".";
							pCrew->legalMessage.push_back(msg);
							this->setLegalityMessage((*segment), singleRule, msg);
							pCrew->isLegal = false;
							bReturn = false;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
							rv->rosterId = (*roster)->rosterId;
							rv->pairingId = (*roster)->pairId;
							rv->dutySequenceNumber = (*duty)->getDutySegNum();
							rv->segmentId = (*segment)->getDBId();
							rv->startDTUtc = (*segment)->getStartTimeUtcAct();
							rv->endDTUtc = (*segment)->getEndTimeUtcAct();
							rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("rRank", rRank));
							rv->operation_result.insert(pair<string, string>("rMaxProb", rMaxProb));
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


//MAX_PROBATION_CROSSRANKS = 8019, //deprecated, replaced by 8069
//8019
bool LegalityChecker::checkMaxProbationCrossRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;

	string rAttribute, rFleet, rMaxProbation, rActingRank = "*";
	//FLEET,PATTERN ATTRIBUTE,MAX OF PROBATION
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "ACTING RANK")
			rActingRank = headeValue;
		if (header == "PATTERN ATTRIBUTE")
			rAttribute = headeValue;
		if (header == "FLEET")
			rFleet = headeValue;
		if (header == "MAX OF PROBATION")
			rMaxProbation = headeValue;
	}

	if (rMaxProbation.length() > 0)
	{
		map<string, int>* probations = RuleParams::GetInstancePtr()->getProbations();
		vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;

		if (this->_application == ROSTER_OPTIMIZER)
		{
			SharedPtr<ROSTER> tempRoster = rosters[pCrew->RosterIndex];
			if (probations->find(tempRoster->actingRank) == probations->end())
				return true;
		}

		unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
		int iMax = stoi(rMaxProbation);
		long long flt_id; string feet;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			if ((!((*roster)->needRuleCheck) || (*roster)->source != "CR") && (this->_application == ROSTER_OPTIMIZER))
				continue;

			if ((*roster)->pairing)
			{
				//only check the rule for the rank set in this rule.
				if (probations->find((*roster)->actingRank) == probations->end())
					continue;

				if (rAttribute != "*")
				{
					string attributes = (*roster)->pairing->getAttribute();
					if (attributes.find(rAttribute) == string::npos)
					{
						continue;
					}
				}

				vector<Duty *> duties = (*roster)->pairing->getDutyVec();
				for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
				{
					vector<Segment*> segments = (*duty)->getSegments();
					for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
					{
						flt_id = (*segment)->getDBId();
						if (rFleet != "*")
						{
							//feet = (*segment)->getFleetCD();
							if (rFleet != (*segment)->getFleetCD())
								continue;
						}
						if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
						{
							vector<SharedPtr<CrewOnFlight>> crews = crewsOnFlt.find(flt_id)->second;
							int num = getNumberOfProbationers(crews, probations, (*segment)->getStartTimeUtcAct());
							if (num >= iMax)
							{
								string msg = "The number of probationary crew members crossing ranks on flight exceeds the maximum allowed " + rMaxProbation + ".";
								pCrew->legalMessage.push_back(msg);
								this->setLegalityMessage((*segment), singleRule, msg);
								pCrew->isLegal = false;
								bReturn = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
								rv->rosterId = (*roster)->rosterId;
								rv->pairingId = (*roster)->pairId;
								//rv->dutySequenceNumber = (*duty)->getDutySegNum();
								rv->segmentId = (*segment)->getDBId();
								rv->startDTUtc = (*segment)->getStartTimeUtcAct();
								rv->endDTUtc = (*segment)->getEndTimeUtcAct();
								rv->violation_msg = msg;
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("rMaxProbation", rMaxProbation));
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
	}

	return bReturn;
}


//ATTRIBUTE_SPACING = 8010
bool LegalityChecker::checkAttributeSpace(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	//Attribute A,Attribute B,Space Hours
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strAttributeA, strAttributeB, strSpace, strTemp;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "ATTRIBUTE A") {
			strAttributeA = headeValue;
		}
		if (header == "ATTRIBUTE B") {
			strAttributeB = headeValue;
		}
		if (header == "SPACE HOURS") {
			strSpace = headeValue;
		}
	}

	int iCurrentRoster = -1;
	vector<SharedPtr<ROSTER>>& rosters = _dbData->crewList[pCrew->crewIndex]->rosterList;
	if (rosters.size() == 0)
		return true;
	if (this->GetApplication() == ROSTER_OPTIMIZER)
		if (!rosters[pCrew->RosterIndex]->pairing)
			return true;
	time_t lStaDT = 0, lEndDT = 0;
	long lSpaceHrs = atol(strSpace.c_str());
	int iNextRoster;
	if (this->GetApplication() == ROSTER_OPTIMIZER)
	{
		std::string::size_type aPos = rosters[pCrew->RosterIndex]->pairing->getAttribute().find(strAttributeA);
		std::string::size_type bPos = rosters[pCrew->RosterIndex]->pairing->getAttribute().find(strAttributeB);
		if (aPos == std::string::npos && bPos == std::string::npos)
			return true;
		if (aPos != std::string::npos)
		{
			iCurrentRoster = Utility::GetInstancePtr()->getPrevAttributeRoster(rosters, pCrew->RosterIndex, strAttributeB);
			if (iCurrentRoster != FAILURE)
			{
				lEndDT = rosters[iCurrentRoster]->actEndUtc;
				lStaDT = rosters[pCrew->RosterIndex]->actStrUtc;
				if ((lStaDT >= lEndDT) && (lStaDT < lEndDT + lSpaceHrs * 60 * 60))
				{
					if ((rosters[iCurrentRoster]->needRuleCheck) || (rosters[pCrew->RosterIndex]->needRuleCheck))
					{
						isValid = false;
						string errorMsg = "The attribute space before roster[";
						errorMsg += Utility::GetInstancePtr()->ToString(rosters[pCrew->RosterIndex]->rosterId);
						errorMsg += "] is less than " + strSpace + " hours.";
						setLegalityMessage(rosters[pCrew->RosterIndex], pCrew, singleRule, errorMsg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->rosterId = rosters[pCrew->RosterIndex]->rosterId;
						//rv->pairingId = duty->getPairingId();
						//rv->dutySequenceNumber = duty->getDutySegNum();
						//rv->segmentId = current->getDBId();
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						rv->startDTUtc = lStaDT;
						rv->endDTUtc = lStaDT;
						rv->violation_msg = errorMsg;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString(rosters[pCrew->RosterIndex]->rosterId)));
						rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
					}
				}
			}
			iNextRoster = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, pCrew->RosterIndex, strAttributeB);
			if (iNextRoster != FAILURE)
			{
				lEndDT = rosters[pCrew->RosterIndex]->actEndUtc;
				lStaDT = rosters[iNextRoster]->actStrUtc;
				if ((lStaDT >= lEndDT) && (lStaDT < lEndDT + lSpaceHrs * 60 * 60))
				{
					if ((rosters[iNextRoster]->needRuleCheck) || (rosters[pCrew->RosterIndex]->needRuleCheck))
					{
						isValid = false;
						string errorMsg = "The attribute space(" + strAttributeA + "-" + strAttributeB + ") before roster[";
						errorMsg += Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId);
						errorMsg += "] is less than " + strSpace + " hours.";
						setLegalityMessage(rosters[iNextRoster], pCrew, singleRule, errorMsg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->rosterId = rosters[iNextRoster]->rosterId;
						//rv->pairingId = duty->getPairingId();
						//rv->dutySequenceNumber = duty->getDutySegNum();
						//rv->segmentId = current->getDBId();
						rv->startDTUtc = lStaDT;
						rv->endDTUtc = lStaDT;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
						rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
						rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId)));
						rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
						rv->violation_msg = errorMsg;
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
					}
				}
			}

		}
		if (bPos != std::string::npos)
		{
			iCurrentRoster = Utility::GetInstancePtr()->getPrevAttributeRoster(rosters, pCrew->RosterIndex, strAttributeA);
			if (iCurrentRoster != FAILURE)
			{
				lEndDT = rosters[iCurrentRoster]->actEndUtc;
				lStaDT = rosters[pCrew->RosterIndex]->actStrUtc;
				if ((lStaDT >= lEndDT) && (lStaDT < lEndDT + lSpaceHrs * 60 * 60))
				{
					isValid = false;
					string errorMsg = "The attribute space(" + strAttributeA + "-" + strAttributeB + ") before roster[";
					errorMsg += Utility::GetInstancePtr()->ToString(rosters[pCrew->RosterIndex]->rosterId);
					errorMsg += "] is less than " + strSpace + " hours.";
					setLegalityMessage(rosters[pCrew->RosterIndex], pCrew, singleRule, errorMsg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					//rv->rosterId = (*it_roster)->rosterId;
					//rv->pairingId = duty->getPairingId();
					//rv->dutySequenceNumber = duty->getDutySegNum();
					//rv->segmentId = current->getDBId();
					rv->startDTUtc = lStaDT;
					rv->endDTUtc = lStaDT;
					rv->violation_msg = errorMsg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
					rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
					rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId)));
					rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
				}
			}
			iNextRoster = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentRoster, strAttributeA);
			if (iNextRoster != FAILURE)
			{
				lEndDT = rosters[pCrew->RosterIndex]->actEndUtc;
				lStaDT = rosters[iNextRoster]->actStrUtc;
				if ((lStaDT >= lEndDT) && (lStaDT < lEndDT + lSpaceHrs * 60 * 60))
				{
					isValid = false;
					string errorMsg = "The attribute space(" + strAttributeA + "-" + strAttributeB + ") before roster[";
					errorMsg += Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId);
					errorMsg += "] is less than " + strSpace + " hours.";
					setLegalityMessage(rosters[iNextRoster], pCrew, singleRule, errorMsg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = rosters[iNextRoster]->rosterId;
					//rv->pairingId = duty->getPairingId();
					//rv->dutySequenceNumber = duty->getDutySegNum();
					//rv->segmentId = current->getDBId();
					rv->startDTUtc = lStaDT;
					rv->endDTUtc = lStaDT;
					rv->violation_msg = errorMsg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
					rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
					rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId)));
					rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
				}
			}

		}

		return isValid;

	}
	else
		iCurrentRoster = Utility::GetInstancePtr()->getFirstAttributeRoster(rosters, strAttributeA);

	iNextRoster = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentRoster, strAttributeB);
	int iNumberOfAttribute = 0;
	strTemp = strAttributeA;
	while ((iCurrentRoster != FAILURE) && (iNextRoster != FAILURE))
	{
		//check the space of two attributes
		lEndDT = rosters[iCurrentRoster]->actEndUtc;
		lStaDT = rosters[iNextRoster]->actStrUtc;

		if ((lStaDT >= lEndDT) && (lStaDT < lEndDT + lSpaceHrs * 60 * 60))
		{
			isValid = false;
			string errorMsg = "The attribute space(" + strAttributeA + "-" + strAttributeB + ") before roster[";
			errorMsg += Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId);
			errorMsg += "] is less than " + strSpace + " hours.";
			setLegalityMessage(rosters[iCurrentRoster], pCrew, singleRule, errorMsg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->rosterId = rosters[iCurrentRoster]->rosterId;
			//rv->pairingId = duty->getPairingId();
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = current->getDBId();
			rv->startDTUtc = lStaDT;
			rv->endDTUtc = lStaDT;
			rv->violation_msg = errorMsg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
			rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
			rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString(rosters[iNextRoster]->rosterId)));
			rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
		}

		iCurrentRoster = iNextRoster;
		iNextRoster = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, iCurrentRoster, strTemp);
		if (strTemp == strAttributeA)
			strTemp = strAttributeB;
		else
			strTemp = strAttributeA;

	}
	return isValid;
}
