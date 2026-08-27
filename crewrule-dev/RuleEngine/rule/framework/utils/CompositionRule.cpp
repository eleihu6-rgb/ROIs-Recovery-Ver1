#include "CompositionRule.h"

#include "RuleParams.h"
#include "DutyUtils.h"
#include <climits>

static inline string GetCompositionName(const long long compId, const SharedPtr<CrewDataContext>& dbData) {
	for (auto& composition : dbData ->compositionList) {
		if (composition.getCompositionId() == compId) {
			return composition.getName();
		}
	}
	return "";
}


//根据2007/2008,3007/3008得到DUTY最经济配比, 用于MIN REST法规
string CompositionRule::GetMinCompositionForRest(Duty* duty, const SharedPtr<CrewDataContext>& dbData)
{
	return DutyUtils::GetCompositionByDutyFor3(duty, dbData);
	//string minComposition = RuleParams::GetInstancePtr()->basicComposition;
	////TODO 存在问题 2023/12/13 xuedong.he
	////vector<RULE_COMPOSITION> legalCompositions = GetLegalCompositions(duty, dbData);

	////int minPrio = 0;
	////for (vector<RULE_COMPOSITION>::iterator itr = legalCompositions.begin(); itr != legalCompositions.end(); itr++)
	////{
	////	if ((*itr).priority < minPrio || itr == legalCompositions.begin())
	////	{
	////		minPrio = itr->priority;
	////		minComposition = itr->name;
	////	}
	////}

	//return minComposition;
}

vector<std::tuple<long long, string, int>> CompositionRule::GetCompositionOptions(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string division) {
	int application = RuleParams::GetInstancePtr()->getApplication();

	//获取不到配比，默认配比处理方式 取值：MIN - 最小配比、FLT - 获得航班， NA - 返回空配比
	string defaultCompositionMode = dbData->getSystemParamValue("DEFAULT_COMPOSITION_MODE", "FLT");
	long long compId = -1;
	int hierarchy = INT_MAX;
	//std::tuple<long long, int, int> segCompositionOption = std::make_tuple(-1, INT_MAX, -1);
	vector<std::tuple<long long, int, int>> allSegCompOptions;
	for (auto& segment : duty->getSegmentsRead()) {
		auto segCompOptions = GetCompositionOptions(segment, dbData, division);
		allSegCompOptions.insert(allSegCompOptions.end(), segCompOptions.begin(), segCompOptions.end());
		for (auto& segCompOption : segCompOptions) {
			auto& [currCompId, currHierarchy, currOption] = segCompOption;
			if (hierarchy > currHierarchy) {
				compId = currCompId;
				hierarchy = currHierarchy;
			}
		}
	}
	vector<std::tuple<long long, string, int>> compositionOptions;
	for (auto& segCompOption : allSegCompOptions) {
		auto& [currCompId, currHierarchy, currOption] = segCompOption;
		if (currCompId == compId) {
			string currCompName = GetCompositionName(currCompId, dbData);
			//注意：这里Option可能只能满足Duty的部分Segment并不一定所有都满足
			compositionOptions.emplace_back(std::make_tuple(currCompId, currCompName, currOption));
		}
	}
	return compositionOptions;
}

vector<std::tuple<long long, int, int>> CompositionRule::GetCompositionOptions(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const string division) {
	vector<std::tuple<long long, int, int>> results; //tuple<composition.Id,composition.hierarchy,compositionRank.option>

	long long fltId = segment->getDBId();
	auto iterFltPairing = dbData->flightIdToPairing.find(fltId);
	if (iterFltPairing == dbData->flightIdToPairing.end()) {
		//存在异常
		return vector<std::tuple<long long, int, int>>();
	}

	map<string, int> allRankMap;//map<rank, rank crew number>

	auto& pairingIdsOfFlt = iterFltPairing->second;//航班所在的Pairing的ID列表
	for (auto pairingId : pairingIdsOfFlt) {
		auto iterPairing = dbData->pairingIdMap.find(pairingId);
		if (iterPairing == dbData->pairingIdMap.end()) {
			//存在异常
			continue;
		}
		auto pairing = iterPairing->second;
		for (auto& pairingComplement : pairing->getComplements()) {
			auto& rank = pairingComplement.first;
			auto rankCrewNum = pairingComplement.second;

			//仅汇总必要岗位(isMustCrewRank=true)的人数
			auto iterRank = dbData->rankMap.find(rank);
			if (iterRank == dbData->rankMap.end()) {
				//存在异常
				continue;
			}
			if ((division.empty() || iterRank->second.division == division) && iterRank->second.isMustCrewRank) {
				allRankMap[rank] += rankCrewNum;
			}

		}
	}

	if (allRankMap.empty()) {
		return vector<std::tuple<long long, int, int>>();
	}

	//通过allRankMap推出配比和Option
	for (auto& pair : dbData->compositionRankOptionMap) {
		auto compId = pair.first;//配比ID
		auto& optionRankMap = pair.second; //map<option, composition_rank> 配比的Option以及对应的rank和人数（composition_rank）
		for (auto& pair2 : optionRankMap) {
			auto option = pair2.first;
			auto compositionRank = pair2.second;

			if (compositionRank.rankCount == allRankMap.size()) {//首先满足 配比(compId)中该Option内rank数量一致性

				int matchedRankCount = 0;
				for (int i = 0; i < compositionRank.rankCount; i++) {
					auto& rankValue = compositionRank.rankValue[i];

					auto iterAllRank = allRankMap.find(rankValue.rank);
					if (iterAllRank != allRankMap.end() && iterAllRank->second == rankValue.plan_value) {
						matchedRankCount++;//rank和数量都一致，则匹配到
					}
				}

				if (matchedRankCount == allRankMap.size()) {
					results.push_back(std::make_tuple(compId, compositionRank.hierarchy, option));
				}
			}

		}
	}
	return results;
}

int CompositionRule::GetCrewNumOfPlanComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const bool isMustRank) {
	int numberOfPlanned = 0;
	auto& planCompositions = segment->getPlanComposition();
	
	for (auto& planComposition : planCompositions)
	{
		auto& rank = planComposition.first;
		auto rankCrewNum = planComposition.second;

		auto iterRank = dbData->rankMap.find(rank);
		if (iterRank == dbData->rankMap.end()) {
			//存在异常
			continue;
		}
		if (isMustRank) {
			if (iterRank->second.isMustCrewRank) {
				numberOfPlanned += rankCrewNum;
			}
		}
		else {
			numberOfPlanned += rankCrewNum;
		}

	}
	return numberOfPlanned;
}

int CompositionRule::GetCrewNumOfComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const bool isMustRank) {
	int numberOfComposition = 0;

	long long fltId = segment->getDBId();
	auto iterFltPairing = dbData->flightIdToPairing.find(fltId);
	if (iterFltPairing == dbData->flightIdToPairing.end()) {
		//存在异常
		return numberOfComposition;
	}

	auto& pairingIdsOfFlt = iterFltPairing->second;//航班所在的Pairing的ID列表
	for (auto pairingId : pairingIdsOfFlt) {
		auto iterPairing = dbData->pairingIdMap.find(pairingId);
		if (iterPairing == dbData->pairingIdMap.end()) {
			//存在异常
			continue;
		}
		auto pairing = iterPairing->second;
		for (auto& pairingComplement : pairing->getComplements()) {
			auto& rank = pairingComplement.first;
			auto rankCrewNum = pairingComplement.second;

			auto iterRank = dbData->rankMap.find(rank);
			if (iterRank == dbData->rankMap.end()) {
				//存在异常
				continue;
			}

			if (isMustRank) {
				if (iterRank->second.isMustCrewRank) {
					numberOfComposition += rankCrewNum;
				}
			}
			else {
				numberOfComposition += rankCrewNum;
			}
		}
	}

	return numberOfComposition;
}

string CompositionRule::GetComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, string division) {
	string compName;
	long long compid = -9999;
	int hierarchy = 999999;
	if (!segment->getIsOperating() || segment->getAssignment() == "DHD" || segment->getAssignment() == "BUS") {
		return "";
	}
	map<string, int> rankMap;
	
	auto iterFlight = dbData->flightIdMap.find(segment->getDBId());
	if (iterFlight != dbData->flightIdMap.end()) {
		if (iterFlight->second == nullptr) {
			Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, flight do not exist. FlightId:{}, PairingId:{}, DutyId:{}, method=GetComposition", segment->getDBId(), segment->getPairingId(), segment->getDutyId());
		}
		else {
			auto iter = iterFlight->second->getPlanComposition().begin();
			while (iter != iterFlight->second->getPlanComposition().end()) {
				if (dbData->scenario.airline == "CA" && (iter->first == "RO" || iter->first == "OVER")) {
					iter++;
					continue;
				}
				if ((dbData->rankMap[iter->first].division == division || division == "") && dbData->rankMap[iter->first].isMustCrewRank) {
					rankMap[iter->first] += iter->second;
				}
				iter++;
			}
		}
	}


	if (rankMap.size() == 0 && division == "") {
		return "";
	}
	if (rankMap.size() == 0) {
		return "";
	}
	unordered_map<long long, unordered_map<int, composition_rank>>::iterator compIter;
	unordered_map<int, composition_rank>::iterator optionIter;
	map<string, int>::iterator rankIter;
	compIter = dbData->compositionRankOptionMap.begin();
	while (compIter != dbData->compositionRankOptionMap.end()) {
		bool isOk = false;
		optionIter = compIter->second.begin();
		while (optionIter != compIter->second.end()) {

			int iCount = 0;
			int k = -1;
			if (optionIter->second.rankCount == rankMap.size()) {
				for (k = 0; k < optionIter->second.rankCount; k++) {
					string rank = optionIter->second.rankValue[k].rank;
					if (rank == "") {
						continue;
					}
					if (rankMap.find(rank) != rankMap.end() && rankMap[rank] == optionIter->second.rankValue[k].plan_value) {
						iCount++;
					}
					else {
						continue;
					}
				}
			}
			if (iCount == rankMap.size() && k >= optionIter->second.rankCount) {
				isOk = true;
				break;
			}
			optionIter++;
		}

		if (isOk && hierarchy > compIter->second.begin()->second.hierarchy) {
			compid = compIter->first;
			hierarchy = compIter->second.begin()->second.hierarchy;
		}
		compIter++;
	}

	for (auto& composition : dbData->compositionList) {
		if (composition.getCompositionId() == compid) {
			compName = composition.getName();
			break;
		}
	}

	if (compName.empty()) {
		//获取不到配比，默认配比处理方式 取值：MIN - 最小配比、FLT - 获得航班， NA - 返回空配比
		string defaultCompositionMode = dbData->getSystemParamValue("DEFAULT_COMPOSITION_MODE", "FLT");
		return dbData->getDefaultComposition(defaultCompositionMode);
	}

	return compName;
}