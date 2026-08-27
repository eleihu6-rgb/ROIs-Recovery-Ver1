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
#include "../utils/RosterUtils.h"
#include "../utils/StringUtils.h"

using namespace std;

/*
   机组成员多资质检查法规
   法规逻辑：在航班上至少X个拥有多资质组员。
   Tiao 2023.3.14

   法规ID：8127

   需求背景：
	  国航飞行航班带队机长需要有多个资质才能执行特定航班

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
	   PILOTS:组员数量，即该规则在几人制生效。支持通配符*，即任何几人制都生效。
	   上述条件为在符合航班号、航班机场、标签条件的任务环检查组员资质组合关系。

		QUALS：组员多个资质要求定义，如A+B,其中“+”含义为并且。
		MIN NUM：上述有多资质人员，并符合RANKS设定的最小人员数量要求。

   举例：
	 RANKS=CAP|RCAP，QUALS = A+B，MIN NUM=2，符合条件的航班、任务环上至少有两个CAP或RCAP组员，两个组员每个人都具备A和B资质。
	 RANKS=CAP|RCAP，QUALS = A+B+C，MIN NUM=2，符合条件的航班、任务环上至少有两个CAP或RCAP组员，两个组员每个人都具备A、B、C资质。
*/
bool LegalityChecker::checkCOFMultipleQuals(RULE_LEGALITY* pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkCOFMultipleQuals");

	bool isValid = true;
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strBases = "*", strRanks = "*", strFleets = "*", strTeams = "*", strPilots = "*", strAttributes, strFlights, strAirports, strCombinations, strAssignments = "FLY", strMinNum="0";
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES")
			strBases = headeValue;
		if (header == "RANKS")
			strRanks = headeValue;
		if (header == "FLEETS")
			strFleets = headeValue;
		if (header == "CREW TEAMS")
			strTeams = headeValue;
		//飞行员数量
		if (header == "PILOTS")
			strPilots = headeValue;
		if (header == "FLIGHTS")
			strFlights = headeValue;
		if (header == "AIRPORTS")
			strAirports = headeValue;
		if (header == "ATTRIBUTES")
			strAttributes = headeValue;
		if (header == "ASSIGNMENTS")
			strAssignments = headeValue;
		if (header == "QUALS")
			strCombinations = headeValue;
		if (header == "MIN NUM")
			strMinNum = headeValue;
	}

	vector<string> vAttributes, vFlights, vAirports, vQualificationsTemp, vRanks, vAssignments;
	split(strAirports, '|', vAirports);
	split(strFlights, '|', vFlights);
	split(strAttributes, '|', vAttributes);
	//split(strCombinations, '+', vQualifications);
	split(strRanks, '|', vRanks);
	split(strAssignments, '|', vAssignments);
	split(strCombinations, '|', vQualificationsTemp);

	vector<vector<string>> strCheckQuals;
	for (std::size_t i = 0; i < vQualificationsTemp.size(); i++)
	{
		vector<string> strQualsTemp;
		split(vQualificationsTemp[i], '+', strQualsTemp);
		strCheckQuals.push_back(strQualsTemp);
	}

	int iReqCrewNum = 0;/// vQualifications.size(); //需要资质组合的人数

	string crewid = crew->idCrew;


	int iQualedNum = 0;
	if (strMinNum != "*")
		iQualedNum = stoi(strMinNum);

	int iPilotsNum = 0;
	if (strPilots != "*")
		iPilotsNum = stoi(strPilots);

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

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", lCheckedStart, lCheckedEnd))
		return true;

	string airline = this->_dbData->scenario.airline;
	string fltFleet, fltDep, fltArr, fltAttr;

	long long flt_id;
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (auto it = rosters.begin(); it != rosters.end(); ++it)
	{
		SharedPtr<ROSTER> roster = *it;

		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(roster.get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		if (!(roster->pairing))
			continue;

		if (strAssignments != "*" && std::find(vAssignments.begin(), vAssignments.end(), roster->duty) == vAssignments.end())
			continue;

		//ignore the violation of the pre-assigned roster for RO
		//optimize for the consideration of RO performance
		if (this->GetApplication() == ROSTER_OPTIMIZER && (roster->source != "CR" || !(roster->needRuleCheck)))
			continue;

		if (strAttributes != "*")
		{
			fltAttr = roster->pairing->getAttribute();
			//Does fltAttr contains one of strAttributes
			bool bHas = false;

			for (vector<string>::iterator oneAtt = vAttributes.begin(); oneAtt != vAttributes.end(); ++oneAtt)
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

		for (std::size_t di = 0; di < roster->pairing->getNumDuties(); di++)
		{
			Duty* duty = roster->pairing->getDuty(di);
			for (std::size_t si = 0; si < duty->getNumSegments(); si++)
			{
				Segment* segment = duty->getSegment(si);

				if ((segment->getAssignment() == "DHD") || (segment->getAssignment() == "TVL"))
					continue;

				fltFleet = segment->getFleetCD();

				fltDep = segment->getDepStation();
				fltArr = segment->getArrStation();
				if (strAirports != "*" && std::find(vAirports.begin(), vAirports.end(), fltDep) == vAirports.end()
					&& std::find(vAirports.begin(), vAirports.end(), fltArr) == vAirports.end())
					continue;

				const string& fltNum = segment->getFlightNumber();
				if (strFlights != "*" && std::find(vFlights.begin(), vFlights.end(), fltNum) == vFlights.end())
					continue;

				flt_id = segment->getDBId();
				const time_t& start = segment->getStartTimeUtcAct();
				const time_t& end = segment->getEndTimeUtcAct();

				const auto& rfs = this->_dbData->rosterFlightMgr.get(flt_id);
				if (rfs.size() <= 0) continue;

				int numberOfPlanned = 0, numberOfPlannedWithRank=0,numberOfFilledWithRank=0;
				auto& plans = segment->getPlanComposition();

				for (auto singleCom = plans.begin(); singleCom != plans.end(); ++singleCom)
				{
					numberOfPlanned += (*singleCom).second;
					if (strRanks != "*" && std::find(vRanks.begin(), vRanks.end(), (*singleCom).first) != vRanks.end())
						numberOfPlannedWithRank= numberOfPlannedWithRank+ (*singleCom).second;
					if (strRanks == "*")
						numberOfPlannedWithRank = numberOfPlannedWithRank + (*singleCom).second;
				}

				for (auto& vQualifications : strCheckQuals)
				{
					iReqCrewNum = (int)vQualifications.size(); //需要资质组合的人数
					//检查PILOTS参数
					if (iPilotsNum > 0 && iPilotsNum != numberOfPlanned)
					{
						continue;
					}

					int iQualifiedCrewNum = 0;

					for (const auto& rf:rfs)
					{
						if (rf->assignment != "" && rf->assignment != "OPR" && rf->assignment != "FLY" && rf->assignment != "MVO" && rf->assignment.find("SBY") == string::npos && rf->assignment != "SIM" && rf->assignment != "TRAINING")
							continue;

						if (std::find(_dbData->scenario.divisionConstruction.begin(), _dbData->scenario.divisionConstruction.end(), rf->division) == _dbData->scenario.divisionConstruction.end()) {
							continue;
						}

						const string& crewRank = rf->actingRank;
						if (crewRank != "")
							if (strRanks != "*" && std::find(vRanks.begin(), vRanks.end(), crewRank) == vRanks.end())
								continue;

						numberOfFilledWithRank++;

						//符合设置的组员资质
						vector<string> vUnFillQuals = vQualifications;

						const vector<SharedPtr<CREW_QUALIFICATION>>& quals = this->_dbData->crewIdMap[rf->crewId]->qualificationList;
						for (const auto& qual:quals)
						{
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
								const string& qualName = qual->qual;
								vector<string>::iterator iFill = std::find(vUnFillQuals.begin(), vUnFillQuals.end(), qualName);
								if (iFill != vUnFillQuals.end())
								{
									vUnFillQuals.erase(iFill);
								}
								/*
								国航独有逻辑，暂时Hardcode
								RTEW > RTEE > RTES > RTWW > RTWS > RTAW > RTAS
								PPL1 > PPL2 > PPL3 > PPL4 > PPL5
								*/
								else if (airline == "CA")
								{
									int level = this->_reportQuals[qualName];

									if (level > 0)
									{
										//向下满足需求
										for (auto& reqQual : vUnFillQuals)
										{
											int iReqLevel = this->_reportQuals[reqQual];
											if (level <= iReqLevel && iReqLevel > 0)
											{
												vector<string>::iterator iFill = std::find(vUnFillQuals.begin(), vUnFillQuals.end(), reqQual);
												if (iFill != vUnFillQuals.end())
												{
													vUnFillQuals.erase(iFill);
													break;
												}
											}
										}
									}
									else
									{
										int level = this->_airportQuals[qualName];
										if (level > 0)
										{
											//向下满足需求
											for (auto& reqQual : vUnFillQuals)
											{
												int iReqLevel = this->_airportQuals[reqQual];
												if (level <= iReqLevel && iReqLevel > 0)
												{
													vector<string>::iterator iFill = std::find(vUnFillQuals.begin(), vUnFillQuals.end(), reqQual);
													if (iFill != vUnFillQuals.end())
													{
														vUnFillQuals.erase(iFill);
														break;
													}
												}
											}
										}
									}
								}

							}
						}
						//计算符合多个资质人员数量
						if (vUnFillQuals.size() == 0)
							iQualifiedCrewNum++;

					}

					int iOpenedPositon = numberOfPlannedWithRank - numberOfFilledWithRank; // 剩余多少个位置未分配Crew

					if (iQualifiedCrewNum < iQualedNum && iQualedNum > 0 && iQualedNum - iQualifiedCrewNum > iOpenedPositon)
					{
						char strBuf[100] = { 0 };
						utcToUtcStr(segment->getStartTimeLocSch(), strBuf, sizeof(strBuf));
						string flightNum = segment->getSegNumber() + "/" + string(strBuf).substr(0, 10);

						string msg = "The number of crew members with multiple qualifications ({0:strCombinations}) on flight ({1:flightNum}) is less than the minimum required {2:strMinNum}.";
						msg = StringUtils::Format(msg, strCombinations, flightNum, strMinNum);

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
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("crewId", crewid));
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