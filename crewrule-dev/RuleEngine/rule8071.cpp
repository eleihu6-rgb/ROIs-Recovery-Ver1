#pragma once

#include "RuleEngine.h"
//#include "Utility.h"

//#include <time.h>
#include <algorithm>
//#include <iostream>

#include "CrewDB.h"
//#include "UtilFunc.h"
//#include "RuleParams.h"
//#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/PhaseUtils.h"

inline static vector<SharedPtr<ROSTER>> getValidRosters(const SharedPtr<CREW>& crew, const vector<string>& crewTeams, const vector<SharedPtr<ROSTER>>& rosters) {
	vector<SharedPtr<ROSTER>> validRosters;
	vector<SharedPtr<CREW_TEAM>>& teams = crew->teamList;
	for (vector<SharedPtr<CREW_TEAM>>::iterator team = teams.begin(); team != teams.end(); ++team)
	{
		if (find(crewTeams.begin(), crewTeams.end(), (*team)->teamName) != crewTeams.end())
		{
			for (auto& roster : rosters) {
				if (roster->actStrUtc >= (*team)->effDt && roster->actRestStrUtc <= (*team)->expDt)
				{
					validRosters.push_back(roster);
				}
			}
			
		}
	}
	return validRosters;
}

/*
    任务最大频次法规，计算任务频次有两种模式：航班、任务环（目前功能：不管出现航班多次，作为任务环只算一次）。
	根据国航飞行反馈，增加航班级别最大频次限制功能。
	新增MODE参数，F - Flight；P - Pairing
	当法规参数设置机场时，在航班模式下统计飞行航班（置位除外）的频次，比如设置SVO，一个任务环包括：
	PEKSVO-SVOPEK（DHD）-LO-PEKSVO-SVOPEK，算1.5次；
	PEKSVO-SVOPEK-LO-PEKSVO-SVOPEK，算2次；
	PEKSVO-SVOPEK（DHD）-LO-PEKSVO（DHD）-SVOPEK，算1次；
	在航班参数下，执行次数=满足条件航班次数/2 (不取整）	。计算航段数除以2（不取整数），加一个月度最大乘机次数控制规则（数任务环）
*/

bool LegalityChecker::checkMaxRosterProperties(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	int ret = 0;
	bool bReturn = true;

	string airlinecode = this->_dbData->scenario.airline;
	//string rBases, rRanks, rFleets, rLabels, rPeriod, rAttributes, rGroups, rQualifiers, rDests, rUnit, rMax, rMin;

	rule8071 * ruleParam = (rule8071 *)singleRule->parsedParam.get();
	const string& rBases = ruleParam->rBases;
	const string& rRanks = ruleParam->rRanks;
	const string& rFleets = ruleParam->rFleets;
	const string& rTeams = ruleParam->rTeams;
	const vector<string>& teams = splitWithCache(rTeams, '|');
	const string& rFlights = ruleParam->rFlightNums;
	const string& rAttributes = ruleParam->rAttributes;
	const string& rGroups = ruleParam->rGroups;
	const string& rQualifiers = ruleParam->rQualifiers;
	const string& rLabels = ruleParam->rLabels;
	const string& rDests = ruleParam->rDests;
	const string& rPosition = ruleParam->rPositions;
	const string& rPeriod = ruleParam->rPeriod;
	const string& rUnit = ruleParam->rUnit;
	double iMin = ruleParam->dMin;
	double iMax = ruleParam->dMax;
	const string& checkmode=ruleParam->rCheckMode;
	roster_space& rp = ruleParam->rp;
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	string base = crew->getPrimeBase();
	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	vector<SharedPtr<ROSTER>> rosters = PhaseUtils::Filter(crew->rosterList, singleRule->phase, this->_dbData);
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
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBases, rRanks, rFleets, rTeams, rPosition, lCheckedStart, lCheckedEnd))
		return true;

	double numberOfRoster = 0.0;
	map<time_t, time_t> mpRanges = Utility::GetInstancePtr()->getDateRangeFromLong(rUnit, rPeriod, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 48 * 3600, weekdayStartFrom, offsetMinutes);

	//2023/12/11 8002支持Alliance的RP概念定义
	if (rUnit == "RP")
	{
		mpRanges.clear();
		for (auto& rp : this->_dbData->rosterPeriodList)
		{
			if (Utility::GetInstancePtr()->isTimeOverlap(rp.rp_start, rp.rp_end, lCheckedStart, lCheckedEnd))
			{
				int iNum = stoi(rPeriod);
				//假设为基地本地时
				time_t start = rp.rp_start;
				//假设结束日期为当日23:59
				time_t end = rp.rp_end + 24 * 60 * 60;
				//转换成Crew基地本地时间开始、结束日期，offsetMinutes
				start = start - offsetMinutes * 60 - (iNum - 1) * 28 * 24 * 60 * 60;
				end = end - offsetMinutes * 60;
				mpRanges.insert(pair<time_t, time_t>(start, end));
			}
		}
	}

	vector<SharedPtr<ROSTER>> validRosters = (rTeams.empty() || rTeams == "*" || this->_application == ROSTER_OPTIMIZER) ? rosters : getValidRosters(crew, teams, rosters);
	for (map<time_t, time_t>::iterator mpRange = mpRanges.begin(); mpRange != mpRanges.end(); ++mpRange)
	{
		//if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, rTeams, (*mpRange).first, (*mpRange).second))
		//	continue;

		if (checkmode=="F")
			numberOfRoster = Utility::GetInstancePtr()->howManyFlightsInRange(validRosters, &rp, this->_dbData, (*mpRange).first, (*mpRange).second, this->_application == ROSTER_OPTIMIZER, pCrew->RosterIndex);
		else if (checkmode == "D")
			numberOfRoster = Utility::GetInstancePtr()->howManyDutiesInRange(validRosters, &rp, this->_dbData, (*mpRange).first, (*mpRange).second, this->_application == ROSTER_OPTIMIZER, pCrew->RosterIndex);
		else
			numberOfRoster = Utility::GetInstancePtr()->howManyRostersInRange2(validRosters, &rp, this->_dbData, (*mpRange).first, (*mpRange).second, this->_application == ROSTER_OPTIMIZER, pCrew->RosterIndex);

		if (numberOfRoster > iMax || (numberOfRoster < iMin && this->_application != ROSTER_OPTIMIZER) && iMin > 0)
		{
			pCrew->isLegal = false;
			if (this->GetApplication() == ROSTER_OPTIMIZER) {
				return false;
			}
			stringstream ss;
			ss << "The number of rosters(" << numberOfRoster << ") must be less than " << iMax << " and more than " << iMin << ",Rule parameters(";
			//string msg = "The number of rosters(" + Utility::GetInstancePtr()->ToString(numberOfRoster)+") must be less than " + rMax + " and more than "+rMin+",rule parameters(";
			ss << "attribute=" << rAttributes;
			ss << ",assignment group=" << rGroups;
			ss << ",label=" << rLabels;
			ss << ",qualifier=" << rQualifiers;
			ss << ",destination=" << rDests << ").";
			string msg = ss.str();
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
			rv->startDTUtc = (*mpRange).first;
			rv->endDTUtc = (*mpRange).second;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("numberOfRoster", Utility::GetInstancePtr()->dToa(numberOfRoster)));
			rv->operation_result.insert(pair<string, string>("iMax", Utility::GetInstancePtr()->dToa(iMax)));
			rv->operation_result.insert(pair<string, string>("iMin", Utility::GetInstancePtr()->dToa(iMin)));
			rv->operation_result.insert(pair<string, string>("rAttributes", rAttributes));
			rv->operation_result.insert(pair<string, string>("rGroups", rGroups));
			rv->operation_result.insert(pair<string, string>("rLabels", rLabels));
			rv->operation_result.insert(pair<string, string>("rQualifiers", rQualifiers));
			rv->operation_result.insert(pair<string, string>("rDests", rDests));
			this->addRuleViolations(rv, singleRule);
		}
	}
	return bReturn;
}

bool LegalityChecker::isMaxRosterProperties(RULE_LEGALITY *pCrew, const std::string &label) {
    const auto &rules = this->_dbData->getRuleFunctions(RULES::MIN_MAX_BY_ROSTER_PROPERTIES);
    auto IxMaxCountCheck = [&](const DBRule *singleRule) {
        bool bReturn = false;
        string airlinecode = this->_dbData->scenario.airline;
        auto *ruleParam = (rule8071 *) singleRule->parsedParam.get();
        const string &rBases = ruleParam->rBases;
        const string &rRanks = ruleParam->rRanks;
        const string &rFleets = ruleParam->rFleets;
        const string &rTeams = ruleParam->rTeams;

        const string &rLabels = ruleParam->rLabels;
        const string &rPosition = ruleParam->rPositions;
        const string &rPeriod = ruleParam->rPeriod;
        const string &rUnit = ruleParam->rUnit;
        double iMax = ruleParam->dMax;
        const string &checkmode = ruleParam->rCheckMode;
        roster_space &rp = ruleParam->rp;
        string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
        if (std::find(rp.labels.begin(), rp.labels.end(), label) == rp.labels.end())
            return false;
        SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
        string base = crew->getPrimeBase();
        auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
        vector<SharedPtr<ROSTER>> rosters = PhaseUtils::Filter(crew->rosterList, singleRule->phase, this->_dbData);
        if (rosters.size() == 0)
            return false;
        time_t lCheckedStart = 0, lCheckedEnd = 0;
        if (this->_application == ROSTER_OPTIMIZER) {
            lCheckedStart = this->_dbData->scenario.startDtUTC;
            lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
        } else {
            lCheckedStart = rosters[0]->actStrUtc;
            lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
        }
        if (!Utility::GetInstancePtr()->isCrewQualified(crew, rBases, rRanks, rFleets, rTeams, rPosition, lCheckedStart,
                                                        lCheckedEnd))
            return false;

        double numberOfRoster = 0.0;
        map<time_t, time_t> mpRanges = Utility::GetInstancePtr()->getDateRangeFromLong(rUnit, rPeriod,
                                                                                       this->_dbData->scenario.startDtUTC,
                                                                                       this->_dbData->scenario.endDtUTC +
                                                                                       48 * 3600, weekdayStartFrom,
                                                                                       offsetMinutes);

        //2023/12/11 8002支持Alliance的RP概念定义
        if (rUnit == "RP") {
            mpRanges.clear();
            for (auto &rp: this->_dbData->rosterPeriodList) {
                if (Utility::GetInstancePtr()->isTimeOverlap(rp.rp_start, rp.rp_end, lCheckedStart, lCheckedEnd)) {
                    int iNum = stoi(rPeriod);
                    //假设为基地本地时
                    time_t start = rp.rp_start;
                    //假设结束日期为当日23:59
                    time_t end = rp.rp_end + 24 * 60 * 60;
                    //转换成Crew基地本地时间开始、结束日期，offsetMinutes
                    start = start - offsetMinutes * 60 - (iNum - 1) * 28 * 24 * 60 * 60;
                    end = end - offsetMinutes * 60;
                    mpRanges.insert(pair<time_t, time_t>(start, end));
                }
            }
        }

        for (auto & mpRange : mpRanges) {
            if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, rTeams, mpRange.first, mpRange.second))
                continue;
            if (checkmode == "F")
                numberOfRoster = Utility::GetInstancePtr()->howManyFlightsInRange(rosters, &rp, this->_dbData,
                                                                                  mpRange.first, mpRange.second,
                                                                                  this->_application ==
                                                                                  ROSTER_OPTIMIZER, pCrew->RosterIndex);
            else
                numberOfRoster = Utility::GetInstancePtr()->howManyRostersInRange2(rosters, &rp, this->_dbData,
                                                                                   mpRange.first, mpRange.second,
                                                                                   this->_application ==
                                                                                   ROSTER_OPTIMIZER,
                                                                                   pCrew->RosterIndex);

            if (numberOfRoster >= iMax) {
                return true;
            }
        }
        return bReturn;
    };
    auto result = std::any_of(rules.begin(), rules.end(), [&](const DBRule &rule) {
        return IxMaxCountCheck(&rule);
    });
    return result;
}