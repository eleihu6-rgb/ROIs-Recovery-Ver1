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
#include "rule/framework/utils/RosterUtils.h"
#include "rule/framework/utils/SegmentUtils.h"


//MIN_QAL_PER_FLEET_RANK
bool LegalityChecker::checkGenMinQualByFleetAndRank(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;

	string rFleet, rActingRank, rMinTimes = "0", rQualification, strDep, strArr, rAttribute, rCrewNationality = "*", rDestinationCountries="*", rGroups = "*", rMaxTimes = "99", rCrewTeams = "*", rFlightComposition = "*";
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		//FLIGHT FLEETS,ACTING RANK,REQUIRED QUALIFICATION,MIN TIMES,DEP,ARR,ATTRIBUTES,CREW NATIONALITY,DESTINATION COUNTRIES,REQUIRED,FLIGHT ASSIGNMENT GROUPS
		header = iter->first;
		headeValue = iter->second;
		if (header == "FLIGHT FLEETS")
			rFleet = headeValue;
		if (header == "ACTING RANKS")
			rActingRank = headeValue;
		if (header == "CREW NATIONALITY")
			rCrewNationality = headeValue;
		if (header == "DESTINATION COUNTRIES")
			rDestinationCountries = headeValue;
		if (header == "DEP")
			strDep = headeValue;
		if (header == "ARR")
			strArr = headeValue;
		if (header == "ATTRIBUTES")
			rAttribute = headeValue;
		if (header == "FLIGHT ASSIGNMENT GROUPS")
			rGroups = headeValue;
		if (header == "FLIGHT COMPOSITIONS")
			rFlightComposition = headeValue;
		if (header == "REQUIRED QUALIFICATIONS")
			rQualification = headeValue;
		if (header == "CREW TEAMS")
			rCrewTeams = headeValue;
		if (header == "MIN LIMITS")
			rMinTimes = headeValue;
		if (header == "MAX LIMITS")
			rMaxTimes = headeValue;
	}
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	vector<string> strDepps, strArrs, strFleets, strAttributes, strActingRanks, strQualifications, strCrewTeams;
	vector<string> crewNationalities, exceptCrewNationalities;
	vector<string> destinationCountries, exceptDestinationCountries;
	vector<string> flightCompositions;
	vector<string> exceptCrewTeams, exceptAttributes;
	split(strDep, '|', strDepps);
	split(strArr, '|', strArrs);
	split(rFleet, '|', strFleets);
	split(rActingRank, '|', strActingRanks);
	split(rQualification, '|', strQualifications);
	split(rFlightComposition, '|', flightCompositions);

	if (rCrewNationality.find("!(") == string::npos) {
		split(rCrewNationality.c_str(), '|', crewNationalities);
	}
	else {
		string except = rCrewNationality.substr(2, rCrewNationality.size() - 3);
		split(except.c_str(), '|', exceptCrewNationalities);
	}

	if (rDestinationCountries.find("!(") == string::npos) {
		split(rDestinationCountries.c_str(), '|', destinationCountries);
	}
	else {
		string except = rDestinationCountries.substr(2, rDestinationCountries.size() - 3);
		split(except.c_str(), '|', exceptDestinationCountries);
	}

	if (rCrewTeams.find("!(") == string::npos) {
		split(rCrewTeams, '|', strCrewTeams);
	}
	else {
		string except = rCrewTeams.substr(2, rCrewTeams.size() - 3);
		split(except.c_str(), '|', exceptCrewTeams);
	}

	if (rAttribute.find("!(") == string::npos) {
		split(rAttribute, '|', strAttributes);
	}
	else {
		string except = rAttribute.substr(2, rAttribute.size() - 3);
		split(except.c_str(), '|', exceptAttributes);
	}

	vector<string> vAssignmentGroups, vAssignments;
	split(rGroups, '|', vAssignmentGroups);
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	if (rGroups != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			if (std::find(vAssignmentGroups.begin(), vAssignmentGroups.end(), (*assignment)->assignmentGroup) != vAssignmentGroups.end()
				&& (this->_dbData->version == 3 || (*assignment)->airline == this->_dbData->scenario.airline))
			{
				vAssignments.push_back((*assignment)->assignemnt);
			}
		}
	}

	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;

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

	int iMinTimes = 0;
	int iMaxTimes = 0;

	if (!rMinTimes.empty() && rMinTimes != "*")
		iMinTimes = stoi(rMinTimes);
	if (!rMaxTimes.empty() && rMaxTimes != "*")
		iMaxTimes = stoi(rMaxTimes);

	string airline = this->_dbData->scenario.airline;
	string crewid = crew->idCrew;
	string fltFleet, fltDep, fltArr, fltAttr;
	vector<string> pairingAttrList;

	long long flt_id;

	int numberOfQualfied = 0;
	int numberOfRequired = 0;
	int numPAQualfied = 0;
	bool hasQual = false;
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (auto it = rosters.begin(); it != rosters.end(); ++it)
	{
		SharedPtr<ROSTER>& roster = *it;
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs( roster.get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		//if (roster->rosterId == 21204212)
		//printf("ok");
		//ignore the violation of the pre-assigned roster for RO
		//optimize for the consideration of RO performance
		if (this->GetApplication() == ROSTER_OPTIMIZER && (roster->source != "CR" || !(roster->needRuleCheck)))
			continue;
		//strActingRanks
		//if (rActingRank != "*" && rActingRank != roster->actingRank)
		if (rActingRank != "*" && std::find(strActingRanks.begin(), strActingRanks.end(), roster->actingRank) == strActingRanks.end())
			continue;

		if (!(roster->pairing))
			continue;

		if (rAttribute != "*")
		{
			pairingAttrList.clear();
			fltAttr = roster->pairing->getAttribute();
			split(fltAttr, '|', pairingAttrList);
			//Does fltAttr contains one of strAttributes
			if (!strAttributes.empty()) {
				bool bHas = false;

				for (vector<string>::iterator oneAtt = strAttributes.begin(); oneAtt != strAttributes.end(); ++oneAtt)
				{
					if (find(pairingAttrList.begin(), pairingAttrList.end(), (*oneAtt)) != pairingAttrList.end())
					{
						bHas = true;
						break;
					}
				}
				if (!bHas)
					continue;
			}
			else if (!exceptAttributes.empty()) {
				bool bHas = false;
				for (vector<string>::iterator oneAtt = pairingAttrList.begin(); oneAtt != pairingAttrList.end(); ++oneAtt)
				{
					if (find(exceptAttributes.begin(), exceptAttributes.end(), (*oneAtt)) != exceptAttributes.end())
					{
						bHas = true;
						break;
					}
				}
				if (bHas)
					continue;
			}			
		}

		//if (rCrewTeams != "*")
		//{
		//	const auto & crewTeams = crew->teamList;
		//	bool tHas = false;

		//	for (const auto & team : crewTeams) {
		//		if (find(strCrewTeams.begin(), strCrewTeams.end(), team->teamName) != strCrewTeams.end()
		//			&& team->effDt <= roster->getEndTimeLocAct() && team->expDt > roster->getStartTimeLocAct() && team->isValid) {
		//			tHas = true;
		//			break;
		//		}
		//	}
		//	if (!tHas)
		//		continue;
		//	
		//	

		//}
		int numberOfPlanned = 0, numberOfFilled = 0;
		//vector<Duty *> duties = roster->pairing->getDutyVec();
		//for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty* duty = roster->pairing->getDuty(di);
			//vector<Segment*> segments = duty->getSegments();
			//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				Segment* segment = duty->getSegment(si);
				numberOfPlanned = 0, numberOfFilled = 0;
				int numberOfCrewTeam = 0, numberOfExceptCrewTeam = 0;
				fltFleet = segment->getFleetCD();
				if (rFleet != "*" && (std::find(strFleets.begin(), strFleets.end(), fltFleet) == strFleets.end()))
					continue;

				fltDep = segment->getDepStation();
				if (strDep != "*" && std::find(strDepps.begin(), strDepps.end(), fltDep) == strDepps.end())
					continue;

				fltArr = segment->getArrStation();
				if (strArr != "*" && std::find(strArrs.begin(), strArrs.end(), fltArr) == strArrs.end())
					continue;

				if (rGroups != "*" && std::find(vAssignments.begin(), vAssignments.end(), segment->getAssignment()) == vAssignments.end())
					continue;

				if (rFlightComposition != "*" && !rFlightComposition.empty()) {
					const auto& compositionName = SegmentUtils::GetCompositionBySegmentFor3(segment, _dbData);
					if (find(flightCompositions.begin(), flightCompositions.end(), compositionName) == flightCompositions.end())
						continue;
				}

				flt_id = segment->getDBId();
				time_t start = segment->getStartTimeUtcAct();
				time_t end = segment->getEndTimeUtcAct();
				numberOfQualfied = 0;
				numPAQualfied = 0;
				numberOfFilled = 0;
				hasQual = false;
				vector<SharedPtr<RosterFlight>> rfs = this->_dbData->rosterFlightMgr.get(segment->getDBId());
				if (rfs.size() > 0)
				{
					//vector<SharedPtr<CrewOnFlight>>& crews = crewsOnFlt.find(flt_id)->second;
					
					auto& plans = segment->getPlanComposition();

					if (rActingRank == "*")
					{
						for (auto singleCom = plans.begin(); singleCom != plans.end(); ++singleCom)
						{
							numberOfPlanned += (*singleCom).second;
						}
					}
					else
					{
						for (vector<string>::iterator rank = strActingRanks.begin(); rank != strActingRanks.end(); ++rank)
						{
							auto plan = plans.find((*rank));
							if (plan != plans.end())
							{
								numberOfPlanned += (*plan).second;
							}
						}
					}
					for (vector<SharedPtr<RosterFlight>>::iterator rf = rfs.begin(); rf != rfs.end(); ++rf)
					{
						if ((*rf)->division != crew->division) {
							//仅检查当前部门(P/C)的人员
							continue;
						}
						if (rGroups != "*" && std::find(vAssignments.begin(), vAssignments.end(), (*rf)->assignment) == vAssignments.end())
							continue;

						//if ((*crew)->actingRank != rActingRank)
						if (rActingRank != "*" && std::find(strActingRanks.begin(), strActingRanks.end(), (*rf)->actingRank) == strActingRanks.end())
							continue;
						else
							numberOfFilled++;
						auto iterCrew = this->_dbData->crewIdMap.find((*rf)->crewId);
						if (iterCrew  == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr){
							continue;
						}
						std::shared_ptr<CREW>& cofCrew = iterCrew->second;
						string& nationality = cofCrew->nationality;
						if (rCrewNationality != "*" && 
							((crewNationalities.size() > 0 && std::find(crewNationalities.begin(), crewNationalities.end(), nationality) == crewNationalities.end()) ||
								 (exceptCrewNationalities.size() > 0 && std::find(exceptCrewNationalities.begin(), exceptCrewNationalities.end(), nationality) != exceptCrewNationalities.end())) )
							continue;

						string arrStationCountry = this->_dbData->findAirportCountry(segment->getArrStation());
						if (rDestinationCountries != "*" &&
							((destinationCountries.size() > 0 && std::find(destinationCountries.begin(), destinationCountries.end(), arrStationCountry) == destinationCountries.end()) ||
								(exceptDestinationCountries.size() > 0 && std::find(exceptDestinationCountries.begin(), exceptDestinationCountries.end(), arrStationCountry) != exceptDestinationCountries.end())))
							continue;

						if (rCrewTeams != "*") {
							const auto& crewTeams = cofCrew->teamList;
							if (!strCrewTeams.empty()) {
								bool tHas = false;

								for (const auto& team : crewTeams) {
									if (find(strCrewTeams.begin(), strCrewTeams.end(), team->teamName) != strCrewTeams.end()
										&& team->effDt <= roster->getEndTimeUtcAct() && team->expDt > roster->getStartTimeUtcAct()) {
										tHas = true;
										numberOfCrewTeam++;
										break;
									}
								}
								if (!tHas)
									continue;
							}
							else if (!exceptCrewTeams.empty()) {
								bool tHas = false;
								for (const auto& team : crewTeams) {
									if (find(exceptCrewTeams.begin(), exceptCrewTeams.end(), team->teamName) != exceptCrewTeams.end()
										&& team->effDt <= roster->getEndTimeUtcAct() && team->expDt > roster->getStartTimeUtcAct()) {
										tHas = true;
										numberOfExceptCrewTeam++;
										break;
									}
								}
								if (tHas)
									continue;
							}
						}

						hasQual = false;
						if (strQualifications[0] == "*") {
							hasQual = true;
						}
						else {
							vector<SharedPtr<CREW_QUALIFICATION>>& quals = cofCrew->qualificationList;
							vector<string> validQuals;
							for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator qual = quals.begin(); qual != quals.end(); ++qual)
							{
								time_t qualStart = (*qual)->issuedUtc;
								time_t qualEnd = (*qual)->expiryUtc;
								if (qualEnd < 0)
									qualEnd = end + 24 * 3600;
								if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
									auto qualPeriod = RosterUtils::GetQualExtension((*qual), qualExtensionConfigsForQualMap);
									qualStart = std::get<0>(qualPeriod);
									qualEnd = std::get<1>(qualPeriod);
								}
								//if (((*qual)->qual == rQualification) && ((*qual)->issuedUtc <= start) && (qualEnd >= end))
								//0006036: [8072] Required Qualification 支持| 间隔多个
								if ((qualStart <= start) && (qualEnd >= end))
								{
									validQuals.push_back((*qual)->qual);
								}
							}

							for (const auto& qual : strQualifications) {
								vector<string> checkQuals;
								split(qual, '+', checkQuals);
								bool allFound = true;
								for (const auto& q : checkQuals) {
									if (find(validQuals.begin(), validQuals.end(), q) == validQuals.end())
										allFound = false;
								}
								if (allFound) {
									hasQual = true;
									break;
								}
							}
						}


						if (hasQual)
							numberOfQualfied++;

						if (hasQual && (*rf)->source == "PA"){
							numPAQualfied++;
						}
					}

				}

				if (this->_application == ROSTER_OPTIMIZER && numPAQualfied > iMaxTimes) {
					if (numberOfQualfied > numPAQualfied)
						return false;
					else
						return true;
				}
				if ((!rMinTimes.empty() && rMinTimes != "*" && numberOfQualfied < iMinTimes)
					|| (!rMaxTimes.empty() && rMaxTimes != "*" && numberOfQualfied > iMaxTimes))
				{
					if (numberOfQualfied < iMinTimes && numberOfPlanned > 0)
					{
						//可安排人数(numberOfPlanned - numberOfFilled) 大于等于 还需要安排该资质人数(iMinTimes - numberOfQualfied)，说明还可以安排新人员满足资质要求，因此不能告警。
						if (numberOfPlanned - numberOfFilled >= iMinTimes - numberOfQualfied)
							continue;
					}
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
					char strBuf[100] = { 0 };
					utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));
					string flightNum = segment->getSegNumber() + "/" + string(strBuf).substr(0, 10);

					string msg = "The number of crews(" + Utility::GetInstancePtr()->iToa(numberOfQualfied)+") with valid qualification(" + rQualification + ") on flight(" + flightNum;
					msg += "," + rFleet + ") and acting rank(";
					msg += rActingRank + ") does not meet the requirement(min=" + rMinTimes + ",max=" + rMaxTimes + "), parameters(" + strDep + "-" + strArr + ",attribute=" + rAttribute + "),current composition(";
					msg += "plan/fill=" + Utility::GetInstancePtr()->iToa(numberOfPlanned) + "/" + Utility::GetInstancePtr()->iToa(numberOfFilled) + ").";
					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(segment, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = duty->getPairingId();
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->segmentId = segment->getDBId();
					rv->startDTUtc = segment->getStartTimeUtcAct();
					rv->endDTUtc = segment->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("numberOfQualfied", Utility::GetInstancePtr()->iToa(numberOfQualfied)));
					rv->operation_result.insert(pair<string, string>("rQualification", rQualification));
					rv->operation_result.insert(pair<string, string>("flightNum", flightNum));
					rv->operation_result.insert(pair<string, string>("rFleet", rFleet));
					rv->operation_result.insert(pair<string, string>("rActingRank", rActingRank));
					rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
					rv->operation_result.insert(pair<string, string>("rMaxTimes", rMaxTimes));
					rv->operation_result.insert(pair<string, string>("strDep", strDep));
					rv->operation_result.insert(pair<string, string>("strArr", strArr));
					rv->operation_result.insert(pair<string, string>("rAttribute", rAttribute));
					rv->operation_result.insert(pair<string, string>("numberOfPlanned", Utility::GetInstancePtr()->iToa(numberOfPlanned)));
					rv->operation_result.insert(pair<string, string>("numberOfFilled", Utility::GetInstancePtr()->iToa(numberOfFilled)));
					rv->operation_result.insert(pair<string, string>("flightAssignmentGroups", rGroups));
					rv->operation_result.insert(pair<string, string>("flightCompositions", rFlightComposition));
					rv->operation_result.insert(pair<string, string>("crewTeams", rCrewTeams));
					rv->operation_result.insert(pair<string, string>("crewNationalitys", rCrewNationality));
					rv->operation_result.insert(pair<string, string>("destinationCountries", rDestinationCountries));
					rv->operation_result.insert(pair<string, string>("numberOfCrewTeam", std::to_string(numberOfCrewTeam)));
					rv->operation_result.insert(pair<string, string>("numberOfExceptCrewTeam", std::to_string(numberOfExceptCrewTeam)));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
				}
			}
		}
	}

	return bReturn;
}