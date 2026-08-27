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
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"

/*
	国航报务资格检查规则
	SGQ 2022.3.9
	法规ID：8117
	参数：
		PILOTS 飞行员数量
		REQUIRED QUALIFICATIONS 报务资质组合。支持报务资质组合的或组合，以|分隔，即满足其中一种组合即可；其中同一个资质组合，支持向下兼容，即在CREW具备前面资质，也视同认为具备后者资质。
		另外，法规检查发现剩余未派遣飞行员，仍有机会满足需求，不告警。如一个航班需要派遣6个飞行员，在下面例子中，当派遣到第3个飞行员，已派遣和正在派遣的3个飞行员至少有一个RTEW/RTEE/RTES
		否则告警。当派遣第二个飞行员时，无论什么情况都不告警（因为后面派遣仍然有机会满足需求）。
	举例：
		资质组合：RTEW+RTEE+RTES+RTES|RTEW+RTES+RTES+RTES
		航班上所有飞行员中有4个飞行员有1个RTEW，1个RTEE，2个RTES资质，或者1个RTEW，3个RTES资质,该航班合规派遣
		其中RTEW > RTEE > RTES，即如有4个飞行员有RTEW也是可以的。
	注意：资质不支持数量折叠描述（如RTEW+3RTES），必须依次输入，用+分隔。

	国航最新反馈（20221212）：
	六大队报务资格获取顺序：先有周边(AW/AS)，然后是西线(WW/WS)，最后是东线(EW/EE/ES)。
	有西线的人就默认有周边，有东线的人就默认有西线周边。RET4和上面资质是独立的，没有逻辑高低关系。
	总结报务资质高低逻辑关系（目前仅适用六大队，其他大队不一定符合这个逻辑关系）：
	EW > EE > ES > WW > WS  > AW > AS (目前该规则无法通用化，待后续整考虑)
	注意：目前该规则不一定适用其他大队
*/

//CREW_COMBINED_QUL
bool LegalityChecker::checkCOFCombinedQuals(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	int rosterIndex = pCrew->RosterIndex;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	const auto& rosters = crew->rosterList;

	if (rosters.size() == 0 || (rosterIndex == -1 && this->GetApplication() == ROSTER_OPTIMIZER))
		return true;

	if (rosterIndex >= (int)rosters.size() && rosterIndex >=0)
	{
		printf("8117:Excpetion, RO index Error");
	}

	const rule8117* ruleParam = (rule8117*)singleRule->parsedParam.get();
	const string& strBases = ruleParam->strBases;
	const string& strRanks = ruleParam->strRanks;
	const string& strCrewFleets = ruleParam->strFleets;
	const string& strTeams = ruleParam->strTeams;
	const string& rFleet = ruleParam->strFltFleets;

	const string& rActingRank = ruleParam->strActingRanks;
	const string& rCrewNationality = ruleParam->strNationality;
	const string& rDep = ruleParam->strDeps;
	const string& rArr = ruleParam->strArrs;
	const string& rAirports = ruleParam->strAirports;
	const string& rAttribute = ruleParam->strAttributes;
	const string& rGroups = ruleParam->strAssignments;
	const string& rPilots = ruleParam->strPilots;
	const string& rQualification = ruleParam->strCombinations;
	const string& rFlights = ruleParam->strFlights;

	vector<string> strDepps, strArrs, strFleets, strAttributes, strActingRanks, strQualifications,strAirports,strFlights;
	split(rDep, '|', strDepps);
	split(rArr, '|', strArrs);
	split(rFleet, '|', strFleets);
	split(rAttribute, '|', strAttributes);
	split(rActingRank, '|', strActingRanks);
	split(rQualification, '|', strQualifications);
	split(rAirports, '|', strAirports);
	split(rFlights, '|', strFlights);

	vector<vector<string>> strCheckQuals;
	vector<vector<pair<string, int>>> strQuals;

	for (std::size_t i = 0; i < strQualifications.size(); i++)
	{
		vector<pair<string, int>> strQual;
		vector<string> strQualsTemp;
		split(strQualifications[i], '+', strQualsTemp);
		strCheckQuals.push_back(strQualsTemp);
		for (std::size_t j = 0; j < strQualsTemp.size(); j++)
		{
			strQual.push_back(std::pair<string, int>(strQualsTemp[j], 0));
		}
		strQuals.push_back(strQual);
	}

	int iPilotsNum = 0;

	if (rPilots != "*")
	{
		std::stringstream ss(rPilots);
		ss >> iPilotsNum;
	}

	vector<string> vAssignmentGroups, vAssignments;
	split(rGroups, '|', vAssignmentGroups);
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	if (rGroups != "*")
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); ++assignment)
		{
			if (std::find(vAssignmentGroups.begin(), vAssignmentGroups.end(), (*assignment)->assignmentGroup) != vAssignmentGroups.end())
			{
				vAssignments.push_back((*assignment)->assignemnt);
			}
		}
	}

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
	if (strBases != "*" || strRanks != "*" || strCrewFleets != "*" || strTeams != "*")
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strCrewFleets, strTeams, "*", lCheckedStart, lCheckedEnd))
			return true;

	//const string& airline = this->_dbData->scenario.airline;
	//const string& crewid = crew->idCrew;

	string fltFleet, fltDep, fltArr, fltAttr;
	bool isCabin = (crew->division != "P");

	long long flt_id;

	int numberOfQualfied = 0;
	int numberOfRequired = 0;
	int numPAQualfied = 0;
	bool hasQual = false;
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (const auto& roster:rosters)
	{
		//SharedPtr<ROSTER> roster = *it;
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(roster.get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		//忽略已经检查的ROSTER
		if (this->GetApplication() == ROSTER_OPTIMIZER)
		{
			if (rosterIndex >= 0 && rosters[rosterIndex]->pairing)
				if (roster->pairId != rosters[rosterIndex]->pairId)
					continue;
			if (roster->source != "CR" || !(roster->needRuleCheck))
				continue;
		}

		if (rActingRank != "*" && std::find(strActingRanks.begin(), strActingRanks.end(), roster->actingRank) == strActingRanks.end())
			continue;

		if (!(roster->pairing))
			continue;


		if (rAttribute != "*")
		{
			fltAttr = roster->pairing->getAttribute();
			//Does fltAttr contains one of strAttributes
			bool bHas = false;

			for (vector<string>::iterator oneAtt = strAttributes.begin(); oneAtt != strAttributes.end(); ++oneAtt)
			{
				if (fltAttr.find((*oneAtt)) != std::string::npos)
				{
					bHas = true;
					break;
				}
			}
			if (!bHas)
				continue;
		}

		int numberOfPlanned = 0, numberOfFilled = 0;
		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty* duty = roster->pairing->getDuty(di);
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				Segment* segment = duty->getSegment(si);
				numberOfPlanned = 0, numberOfFilled = 0;
				fltFleet = segment->getFleetCD();

				if ((segment->getAssignment() == "DHD") || (segment->getAssignment() == "TVL"))
					continue;

				//航班号过滤:
				if (rFlights != "*" && (std::find(strFlights.begin(), strFlights.end(), segment->getFlightNumber()) == strFlights.end()))
					continue;

				//机型、航站、Assignment过滤
				if (rFleet != "*" && ((std::find(strFleets.begin(), strFleets.end(), fltFleet) == strFleets.end()) || !(segment->getIsOperating())))
					continue;

				fltDep = segment->getDepStation();
				if (rDep != "*" && std::find(strDepps.begin(), strDepps.end(), fltDep) == strDepps.end())
					continue;

				fltArr = segment->getArrStation();
				if (rArr != "*" && std::find(strArrs.begin(), strArrs.end(), fltArr) == strArrs.end())
					continue;

				if (rAirports != "*"
					&& std::find(strAirports.begin(), strAirports.end(), fltArr) == strAirports.end()
					&& std::find(strAirports.begin(), strAirports.end(), fltDep) == strAirports.end())
					continue;

				if (rGroups != "*" && std::find(vAssignments.begin(), vAssignments.end(), segment->getAssignment()) == vAssignments.end())
					continue;

				flt_id = segment->getDBId();
				const time_t start = segment->getStartTimeUtcAct();
				const time_t end = segment->getEndTimeUtcAct();
				numberOfQualfied = 0;
				numberOfFilled = 0;
				hasQual = false;

				//if (crew->idCrew == "0000068536" && roster->pairId == 12561373 && rQualification == "RTWS")
				//	printf("");


				//检查航班COF数据的配比
				const auto& rfs = this->_dbData->rosterFlightMgr.get(segment->getDBId());
				if (!rfs.empty())
				{
					const auto& plans= segment->getPlanComposition();
					const auto& fills= segment->getFillComposition();

					for (const auto& singleCom : plans)
					{
						if (rActingRank != "*" && std::find(strActingRanks.begin(), strActingRanks.end(), singleCom.first) == strActingRanks.end())
							continue;
						numberOfPlanned += singleCom.second;
					}

					if (iPilotsNum > 0 && iPilotsNum != numberOfPlanned && numberOfPlanned > 0)
						continue;

					for (const auto& rf : rfs)
					{
						if (rf->assignment != "FLY" && rf->assignment != "OPR" && rf->assignment != "MVO" &&rf->assignment != "MVP")
							continue;

						if (rGroups != "*" && std::find(vAssignments.begin(), vAssignments.end(), rf->assignment) == vAssignments.end())
							continue;
						if (this->_dbData->crewIdMap.find(rf->crewId) == this->_dbData->crewIdMap.end()) {
							continue;
						}
						if (rCrewNationality != "*"
							&& rCrewNationality != this->_dbData->crewIdMap[rf->crewId]->nationality)
							continue;

						if (rActingRank != "*" && std::find(strActingRanks.begin(), strActingRanks.end(), rf->actingRank) == strActingRanks.end())
							continue;
						else
							numberOfFilled++;

					}

					//if (roster->pairId == 12580918 && crew->idCrew =="0000010875" && rAirports =="HKG|SYD")
					//	printf("");

					//初始化
					for (std::size_t t = 0; t < strQuals.size(); t++)
					{
						vector<pair<string, int>>& oneQuals = strQuals[t];
						for (std::size_t y = 0; y < oneQuals.size(); y++)
						{
							oneQuals[y].second = 0;
						}
					}

					for (const auto& rf : rfs)
					{
						if ((rf->assignment == "DHD") || (rf->assignment == "TVL"))
							continue;
						
						for (std::size_t k = 0; k < strQuals.size(); k++)
						{
							if (rActingRank != "*")
							{
								string rfActingRank = rf->actingRank;
								if (std::find(strActingRanks.begin(), strActingRanks.end(), rf->actingRank) == strActingRanks.end())
									continue;
							}

							hasQual = false;

							const string& crewSearch = rf->crewId;
							const auto& quals = this->_dbData->crewIdMap[crewSearch]->qualificationList;

							for (const auto& qual : quals)
							{
								//if (roster->pairId == 12526110 && rQualification == "RET4+RET4" 
								//	&& crew->idCrew == "0000091859" && (*qual)->qual == "RET4")
								//	printf("");

								if (hasQual) //本CREW已经满足
									continue;

								time_t qualStart = qual->issuedUtc;
								time_t qualEnd = qual->expiryUtc;
								if (qualEnd < 0)
									qualEnd = end + 24 * 3600;
								if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
									auto qualPeriod = RosterUtils::GetQualExtension(qual, qualExtensionConfigsForQualMap);
									qualStart = std::get<0>(qualPeriod);
									qualEnd = std::get<1>(qualPeriod);
								}
								if ((qualStart < start) && (qualEnd >= end))
								{
									//std::unordered_multimap<string, int>::iterator it = strQuals[k].find((*qual)->qual);
									string key = qual->qual;
									auto it = std::find_if(strQuals[k].begin(), strQuals[k].end(), [key](const auto& p) { return p.first == key; });
									if (it != strQuals[k].end() && it->second == 0)
									{
										it->second = 1; //满足需求
										hasQual = true;
										break;
									}
									else if (this->_dbData->scenario.airline == "CA")
									{
										if (it != strQuals[k].end() && it->second == 1) 
										{
											//向下满足需求
											for (vector<pair<string, int>>::iterator it_cont = it; it_cont != strQuals[k].end(); ++it_cont)
											{
												if (it_cont->second == 0)
												{
													it_cont->second = 1;
													hasQual = true;
													break;
												}
											}
										}
										else
										{
											/*
											国航独有逻辑，暂时Hardcode
											RTEW > RTEE > RTES > RTWW > RTWS > RTAW > RTAS
											*/
											int level = this->_reportQuals[qual->qual];
											if (it == strQuals[k].end() && level > 0)
											{
												//向下满足需求
												for (vector<pair<string, int>>::iterator it_cont = strQuals[k].begin(); it_cont != strQuals[k].end(); ++it_cont)
												{
													int iReqLevel = this->_reportQuals[it_cont->first];
													if (it_cont->second == 0 && level <= iReqLevel)
													{
														it_cont->second = 1;
														hasQual = true;
														break;
													}
												}
											}
										}
									}
								}
							}
						}
					}

					//查看还有多少位置没有满足需要
					int iUnQualified = 999, iQualReq = 0;
					string strQualsComb;

					for (std::size_t k = 0; k < strQuals.size(); k++)
					{
						int iUnQualifiedTemp = 0, iQualReqTemp = (int)strQuals[k].size();
						string strQualsCombTemp;
						for (vector<pair<string, int>>::iterator it_cont = strQuals[k].begin(); it_cont != strQuals[k].end(); ++it_cont)
						{
							if (it_cont->second == 0)
								iUnQualifiedTemp++;
							else
								strQualsCombTemp = strQualsCombTemp + it_cont->first + "+";
						}
						if (iUnQualifiedTemp < iUnQualified)
						{
							iUnQualified = iUnQualifiedTemp;
							strQualsComb = strQualsCombTemp;
							iQualReq = (int)strQuals[k].size();
						}
					}

					int iOpenedPositon = numberOfPlanned - numberOfFilled; // 剩余多少个位置未分配Crew
					//剩余空的位置，不足以满足法规配置要求
					if ((iOpenedPositon < iUnQualified) && (iUnQualified > 0))
					{
						char strBuf[100] = { 0 };
						utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));
						string flightNum = segment->getSegNumber() + "/" + string(strBuf).substr(0, 10);

						string msg = "The number of qualified crews ({0:iQualReqMinusIUnQualified}) on flight ({1:flightNum}, {2:rFleet}) with the qualification combination ({3:strQualsComb}) does not meet the requirements " \
							"({4:rQualification}), parameters({5:rDep} - {6:rArr}, attribute = {7:rAttribute}), current composition(planned / filled = {8:numberOfPlanned} / {9:numberOfFilled}).";
						msg = StringUtils::Format(msg, (iQualReq - iUnQualified), flightNum, rFleet, strQualsComb, rQualification, rDep, rArr, rAttribute, numberOfPlanned, numberOfFilled);

						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(segment, singleRule, msg);
						pCrew->isLegal = false;
						bReturn = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crew->idCrew;
						rv->rosterId = roster->rosterId;
						rv->dutySequenceNumber = duty->getDutySegNum();
						rv->segmentId = segment->getDBId();
						rv->startDTUtc = segment->getStartTimeUtcAct();
						rv->endDTUtc = segment->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						rv->operation_result.insert(pair<string, string>("iUnQualified", Utility::GetInstancePtr()->iToa(iUnQualified)));
						rv->operation_result.insert(pair<string, string>("iOpenedPositon", Utility::GetInstancePtr()->iToa(iOpenedPositon)));
						rv->operation_result.insert(pair<string, string>("qualfiedCombs", strQualsComb));
						rv->operation_result.insert(pair<string, string>("rQualification", rQualification));
						rv->operation_result.insert(pair<string, string>("flightNum", flightNum));
						rv->operation_result.insert(pair<string, string>("rActingRank", rActingRank));
						rv->operation_result.insert(pair<string, string>("strDep", rDep));
						rv->operation_result.insert(pair<string, string>("strArr", rArr));
						rv->operation_result.insert(pair<string, string>("rAttribute", rAttribute));
						rv->operation_result.insert(pair<string, string>("numberOfPlanned", Utility::GetInstancePtr()->iToa(numberOfPlanned)));
						rv->operation_result.insert(pair<string, string>("numberOfFilled", Utility::GetInstancePtr()->iToa(numberOfFilled)));
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