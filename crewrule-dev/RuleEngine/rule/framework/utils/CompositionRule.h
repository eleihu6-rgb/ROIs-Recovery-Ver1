#ifndef _COMPOSITIONRULE_H_
#define _COMPOSITIONRULE_H_

#include "CrewDB.h"

/**
* 配比规则
*/
class CompositionRule {
public:

	//根据2007/2008,3007/3008得到DUTY最经济配比, 用于MIN REST法规
	static string GetMinCompositionForRest(Duty * duty, const SharedPtr<CrewDataContext>& dbData);

	/*
	* @return 返回<配比ID，配比名称，配比Option> 
	*/
	static vector<std::tuple<long long, string, int>> GetCompositionOptions(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string division = "");

	/*
	* 获得航班的计划配额机组人数
	* @param segment Duty的Segment
	* @param dbData
	* @param isMustRank 是否仅统计必要Rank岗位的人数，true-仅必要岗位，false-所有岗位
	*/
	static int GetCrewNumOfPlanComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const bool isMustRank = true);

	/*
	* 获得航班的实际分配配额机组人数，统计航班的所有的任务环Acting Rank汇总
	* @param segment Duty的Segment
	* @param dbData
	* @param isMustRank 是否仅统计必要Rank岗位的人数，true-仅必要岗位，false-所有岗位
	*/
	static int GetCrewNumOfComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const bool isMustRank = true);

	//static int GetCrewNumOfPlanComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const bool isMustRank = true);

public:
	/*获得Segment的配比
	* @param segment Pairing的Segment
	*/
	static string GetComposition(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, string division = "");

private:
	/*
	* 获得Segment的配比，计算航班的所有的任务环Acting Rank汇总后再匹配配比表
	* @return 返回所有能匹配到的配比及Option，<配比Id、配比优先级hierarchy，配比Option>列表
	*/
	static vector<std::tuple<long long, int, int>> GetCompositionOptions(const Segment* segment, const SharedPtr<CrewDataContext>& dbData, const string division = "");

};

#endif //_COMPOSITIONRULE_H_