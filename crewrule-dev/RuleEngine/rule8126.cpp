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
#include "utils/StringUtils.h"
using namespace std;

/*
   机组资质不可搭配法规
   法规逻辑：在航班上组员拥有两个资质组员，不能同时执行同一个航班。
   Tiao 2023.2.22
   
   法规ID：8126

   需求背景：
      国航飞行存在大量资质不可搭配规则，并且部分资质属于反向设置（即在业务上组员不具备某个资质能力，给该组员分配某一个资质）

   法规参数：
	   BASES：组员基地，支持|多个基地设置，和*通配符
	   RANKS：组员级别，支持|多个级别设置，和*通配符
       FLEETS：组员机型，支持|多个机型设置，和*通配符
       CREW TEAMS：组员分组，支持|多个分组设置，和*通配符
       上述条件为筛选检查组员的条件，并且其中RANKS参与人员资质组合检查，见注释。

       FLIGHTS：航班号，支持|多个航班号设置，和*通配符
       AIRPORTS：航班机场（包括起飞、落地机场），支持|多个机场设置，和*通配符
       ATTRIBUTES：任务环标签，支持|多个标签设置，和*通配符
	   ASSIGNMENTS:航班任务类型的ASSIGNMENT，，支持|多个标签设置，和*通配符
	   PILOTS:组员数量，即该不可搭配规则在几人制生效。支持通配符*，即任何几人制都生效。
	   上述条件为在符合航班号、航班机场、标签条件的任务环检查组员资质组合关系。

		QUAL COMBINATIONS：资质组合定义，如A+B,其中“+”含义为并且。

   举例：
	 QUAL COMBINATIONS = “A+B”，符合条件的航班、任务环上不能有任意两个组员的组合，满足条件：其中一个有A资质，另外一个有B资质。
	 QUAL COMBINATIONS = “A+A”,两个都有A资质的组员不能执行相同航班任务
	 QUAL COMBINATIONS = “A”,有A资质的组员都不能执行该航班任务。
	 注：
	 1、上面条件需要结合RANKS设置，即搜索组员组合在RANKS设置里查找。比如RANKS=CAP|RCAP，即仅检查在CAP和RCAP里的组员资质组合。
	 2、资质组合必须为两个不同组员。如果为同一个组员有两个资质满足资质不可搭配组合，不违规

	 针对国航的业务场景：
	 1、55岁以上组员（资质P6X4）派遣规则：不飞签到0550之前的任务环；不飞HKG；不飞国内跨夜航班（起飞在前一天，落地在第二天的飞行任务）。
	 2、具备某个资质的组员不能执行某个机场的航班。
	 3、机组成员具备两种及以上的资质搭配，不能执行某个航班。
	 4、机场经历
*/
bool LegalityChecker::checkCOFQualCombination(RULE_LEGALITY* pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkCOFQualCombination");

	bool isValid = true;
	const SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	const vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	int rosterIndex = pCrew->RosterIndex;

	if (rosters.size() == 0 || (rosterIndex == -1 && this->GetApplication() == ROSTER_OPTIMIZER))
		return true;

	if (rosterIndex >= (int)rosters.size() && rosterIndex >= 0)
	{
		printf("8126:Excpetion, RO index Error");
	}

	const auto& parameter= singleRule->params;

	const rule8126* ruleParam = (rule8126*)singleRule->parsedParam.get();
	const string& strBases = ruleParam->strBases;
	const string& strRanks = ruleParam->strRanks;
	const string& strFleets = ruleParam->strFleets;
	const string& strTeams = ruleParam->strTeams;
	const string& strPilots = ruleParam->strPilots;
	const string& strFlights = ruleParam->strFlights;
	const string& strAirports = ruleParam->strAirports;
	const string& strAttributes = ruleParam->strAttributes;
	const string& strCombinations = ruleParam->strCombinations;
	const string& strAssignments = ruleParam->strAssignments;
	const string& strActingRanks = ruleParam->strActingRanks;

	const vector<string>& vAirports = ruleParam->vAirports;
	const vector<string>& vFlights = ruleParam->vFlights;
	const vector<string>& vAttributes = ruleParam->vAttributes;
	const vector<string>& vRanks = ruleParam->vRanks;
	const vector<string>& vAssignments = ruleParam->vAssignments;
	const vector<string>& vActingRanks = ruleParam->vActingRanks;
	const vector<vector<string>>& strCheckQuals = ruleParam->strCheckQuals;

	int iReqCrewNum = 0;
	const string& crewid = crew->idCrew;

	int iPilotsNum = 0;

	if (strPilots!="*")
		iPilotsNum=stoi(strPilots);

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

	if (strBases!="*" || strRanks!="*" || strFleets!="*" || strTeams!="*")
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", lCheckedStart, lCheckedEnd))
			return true;

	const string& airline = this->_dbData->scenario.airline;

	long long flt_id;
	time_t qualEnd;
	for (const auto& roster:rosters)
	{
		if (!(roster->pairing))
			continue;

		//忽略已经检查的ROSTER
		if (this->GetApplication() == ROSTER_OPTIMIZER)
		{
			if (rosterIndex >= 0 && rosters[rosterIndex]->pairing)
				if (roster->pairId != rosters[rosterIndex]->pairId)
					continue;
			if (roster->source != "CR" || !(roster->needRuleCheck))
				continue;
		}

		if (strAssignments != "*" && std::find(vAssignments.begin(), vAssignments.end(), roster->duty) == vAssignments.end())
			continue;

		if (strAttributes != "*")
		{
			const string& fltAttr = roster->pairing->getAttribute();
			//Does fltAttr contains one of strAttributes
			bool bHas = false;

			//for (vector<string>::iterator oneAtt = vAttributes.begin(); oneAtt != vAttributes.end(); ++oneAtt)
			for (const auto& oneAtt: vAttributes)
			{
				if (fltAttr.find(oneAtt) != std::string::npos)
				{
					bHas = true;
					break;
				}
			}
			if (!bHas)
				continue;
		}

		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty* duty = roster->pairing->getDuty(di);
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				Segment* segment = duty->getSegment(si);

				if ((segment->getAssignment() == "DHD") || (segment->getAssignment() == "TVL"))
					continue;

				if (strAirports != "*" && std::find(vAirports.begin(), vAirports.end(), segment->getDepStation()) == vAirports.end()
					&& std::find(vAirports.begin(), vAirports.end(), segment->getArrStation()) == vAirports.end())
					continue;

				if (strFlights != "*" && std::find(vFlights.begin(), vFlights.end(), segment->getFlightNumber()) == vFlights.end())
					continue;

				flt_id = segment->getDBId();
				const time_t start = segment->getStartTimeUtcAct();
				const time_t end = segment->getEndTimeUtcAct();

				const auto& rfs = this->_dbData->rosterFlightMgr.get(flt_id);
				if (rfs.empty() || (int)rfs.size() < iReqCrewNum)   //rosterOnFlight数量少于iReqCrewNum的话，则直接跳过
					continue;
				for (auto& vQualifications : strCheckQuals)
				{
					iReqCrewNum = (int)vQualifications.size(); //需要资质组合的人数
					if (iPilotsNum > 0)
					{
						int numberOfPlanned = 0;

						const auto& plans = segment->getPlanComposition();
						for (const auto& plan : plans)
						{
							numberOfPlanned += plan.second;
						}

						//检查PILOTS参数
						if (iPilotsNum != numberOfPlanned)
							continue;
					}

					//符合设置的组员资质
					vector<string> vQualCrews, vQualifiedQuals;
					int rfi = 0;
					for (const auto& rf : rfs)
					{
						if (rf->assignment != "" && rf->assignment != "OPR" && rf->assignment != "FLY" && rf->assignment != "MVO" && rf->assignment.find("SBY") == string::npos && rf->assignment != "SIM" && rf->assignment != "TRAINING")
							continue;

						if (static_cast<int>(vQualCrews.size() + (rfs.size() - rfi)) < iReqCrewNum) //如果检查过已有资质的组员+剩余未检查的组员，总数量少于iReqCrewNum，则直接退出
							break;
						rfi++;
						//如果是单资质不可搭配设置，没有必要查看其他CREW的资质,仅查看本人即可
						if (iReqCrewNum == 1)
						{
							if (crew->idCrew != rf->crewId)
								continue;
						}

						if (rf->actingRank != "" && strActingRanks != "*")
							if (std::find(vActingRanks.begin(), vActingRanks.end(), rf->actingRank) == vActingRanks.end())
								continue;

						const string& crewSearch = rf->crewId;
						const auto& quals = this->_dbData->crewIdMap[crewSearch]->qualListFiltedByRules;

						for (auto& vQual : vQualifications) {
							if (quals.find(vQual) == quals.end())
								continue;

							auto& crewQual = quals.at(vQual);

							qualEnd = crewQual->expiryUtc;
							if (qualEnd < 0)
								qualEnd = end + 24 * 3600;
							if ((crewQual->issuedUtc < start) && (qualEnd >= end)) {
								if ((std::find(vQualCrews.begin(), vQualCrews.end(), rf->crewId)) == vQualCrews.end())
									vQualCrews.push_back(rf->crewId);
								vQualifiedQuals.push_back(crewQual->qual);
							}
						}
					}

					if ((int)vQualCrews.size() < iReqCrewNum) //所有具有资质的组员数量少于iReqCrewNum的话，则直接跳过
						continue;
					
					//如果当前Crew不是造成违规的人员，针对RO忽略告警
					if (this->_application == ROSTER_OPTIMIZER)
					{
						if (find(vQualCrews.begin(), vQualCrews.end(), crew->idCrew) == vQualCrews.end())
							continue;
					}

					//检查不可搭配资质是否都分配了。初始值和vQualifications相同,即假设没有分配不可搭配资质组合；如果为空，说明所有资质被覆盖
					vector<string> vUnFillQuals = vQualifications;
					for (auto& qual : vQualifiedQuals)
					{
						vector<string>::iterator iFill = std::find(vUnFillQuals.begin(), vUnFillQuals.end(), qual);
						if (iFill != vUnFillQuals.end())
							vUnFillQuals.erase(iFill);
					}

					//if (roster->pairId == 12561374 && crew->idCrew == "0000069330" && (strCombinations == "GM0A|GMOB" || strCombinations == "P6U61"))
					//	printf("");
					//if (roster->pairId == 12563021 && crew->idCrew == "0000010957" && (strCombinations == "GA1A" || strCombinations == "P6U6"))
					//	printf("");

					//mQualifiedQualCrews中必须有资质组合中资质，并且不能是同一个人
					//不满足资质不可搭配组合要求，vUnFillQuals为0即不可搭配资质组合中资质都被分配
					if (vUnFillQuals.size() == 0) //不可搭配组合中全部满足，违规
					{
						char strBuf[100] = { 0 };
						utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));
						string flightNum = segment->getSegNumber() + "/" + string(strBuf).substr(0, 10);

						string msg = "The crew qualification matrix on flight ({0:flightNum}) does not meet the requirements ({1:strCombinations}).";
						msg = StringUtils::Format(msg, flightNum, strCombinations);

						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(segment, singleRule, msg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->pairingId = roster->pairId;
						rv->rosterId = roster->rosterId;
						rv->dutySequenceNumber = duty->getDutySegNum();
						rv->segmentId = segment->getDBId();
						rv->startDTUtc = segment->getStartTimeUtcAct();
						rv->endDTUtc = segment->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						rv->operation_result.insert(pair<string, string>("pairingId", Utility::GetInstancePtr()->llToa(roster->pairId)));
						rv->operation_result.insert(pair<string, string>("Flights", strFlights));
						rv->operation_result.insert(pair<string, string>("Airports", strAirports));
						rv->operation_result.insert(pair<string, string>("Attributes", strAttributes));
						rv->operation_result.insert(pair<string, string>("QualificationComb", strCombinations));
						rv->violation_msg = msg;
						this->addRuleViolations(rv, singleRule);
						if (this->_application == ROSTER_OPTIMIZER) return false;
					}
				}
			}
		}
	}
	return true;
}
