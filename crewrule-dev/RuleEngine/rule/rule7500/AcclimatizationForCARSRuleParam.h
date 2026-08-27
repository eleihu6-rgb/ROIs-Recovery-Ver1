/**
 * @file AcclimatizationForCARSRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-16
**/

#ifndef _ACCLIMATIZATIONFORCARSRULEPARAM_H_
#define _ACCLIMATIZATIONFORCARSRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include "AcclimatizationStayPeriodForCARSParam.h"
#include "DailyAdjustmentForCARSParam.h"

class AcclimatizationForCARSRule;



class AcclimatizationForCARSRuleParam : public RuleParam {
friend class AcclimatizationForCARSRule;
public:

	vector<AcclimatizationStayPeriodForCARSParam>& GetAcclimatizationStayPeriodForCARSParams() const {
		return this->_acclimatizationStayPeriodForCARSParams;
	}

	vector<DailyAdjustmentForCARSParam>& GetDailyAdjustmentForCARSParams() const {
		return this->_dailyAdjustmentForCARSParams;
	}

	void SetDailyAdjustmentForCARSParams(const vector<DailyAdjustmentForCARSParam>& dailyAdjustmentForCARSParams) {
		this->_dailyAdjustmentForCARSParams = dailyAdjustmentForCARSParams;
	}

	bool Empty() const;
private:
    explicit AcclimatizationForCARSRuleParam(const Rule* rule) :RuleParam(rule) {
		
	};

    constexpr static unsigned int RuleFuncId = 7500;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 14;

	mutable vector<AcclimatizationStayPeriodForCARSParam> _acclimatizationStayPeriodForCARSParams;
	mutable vector<DailyAdjustmentForCARSParam> _dailyAdjustmentForCARSParams;

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	/**
	* 判断是否匹配时区差
	*/
	bool MatchTimeZoneDiff(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	bool MatchTimeZoneDiffForRestStart(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	bool MatchAcclimatizationForCARSState(const Duty& duty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	//匹配获得前一个Duty的休息开始时间适应状态
	bool MatchAcclimatizationForCARSStateForRestStart(const Duty& currDuty, const Duty& lastAcclimatisedDuty, const SharedPtr<CrewDataContext>& dbData) const;

	/**
	* 基于Duty的开始时间为基准，获得转化周期（适应时间）的分钟数
	*/
	int GetAdaptionPeriod(const Duty& lastAcclimatisedDuty,
		const Duty& maxTimeZoneDiffDuty, const unsigned int maxTimeZoneDiff, const SharedPtr<CrewDataContext>& dbData) const;


};

#endif //_ACCLIMATIZATIONFORCARSRULEPARAM_H_
