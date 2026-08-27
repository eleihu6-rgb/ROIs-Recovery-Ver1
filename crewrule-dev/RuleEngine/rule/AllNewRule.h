#pragma once
#include "../rule/rule0000/CheckGeneralRule.h"
#include "../rule/rule2001/CalculateManualLimitRule.h"
#include "../rule/rule3003/LimitDepOrArrStationForPairingRule.h"
#include "../rule/rule6007/CheckMaxFlightDutyPeriodRule.h"
#include "../rule/rule6007/CalculateMaxFlightDutyPeriodRule.h"
#include "../rule/rule6005/AcclimatizationRule.h"
#include "../rule/rule6006/CalculateAirportRestFaciltyRule.h"
#include "../rule/rule6008/CheckFdpAndFtDiscretionForFdRule.h"
#include "../rule/rule6008/CalculateFdpAndFtDiscretionForFdRule.h"
#include "../rule/rule6009/CheckFdpAndFtDiscretionForCCRule.h"
#include "../rule/rule6009/CalculateFdpAndFtDiscretionForCCRule.h"
#include "../rule/rule6010/LimitBeforeAnnualLeaveRule.h"
#include "../rule/rule6018/LimitLongTransitRule.h"
#include "../rule/rule6019/LimitTransitAndLayoverRule.h"
#include "../rule/rule6020/CalculateMaxFlightDutyBySplitDutyRule.h"
#include "../rule/rule6020/CalculateDutyDpInMandayRule.h"
#include "../rule/rule6020/CheckMaxFlightDutyBySplitDutyRule.h"
#include "../rule/rule6021/LimitAircraftChangeRule.h"
#include "../rule/rule6022/CalculateDutyTimeForDelayedFlightRule.h"
#include "../rule/rule6024/CalculateMaxFdpForStandbyRule.h"
#include "../rule/rule6025/CalculateMaxDutyPeriodRule.h"
#include "../rule/rule6025/CheckMaxDutyPeriodRule.h"
#include "../rule/rule6026/LimitFleetForStandbyRule.h"
#include "../rule/rule6032/CheckMaxConsecutiveWOCLDutyRule.h"
#include "../rule/rule6033/CheckMaxConsecutiveEarlyStartRule.h"
#include "../rule/rule6034/CheckMaxEarlyDutyInAnyConsecutiveDayRule.h"
#include "../rule/rule6100/CalculationOfOffDutyPeriodRule.h"
#include "../rule/rule6101/ReduceOffDutyPeriodAtBaseRule.h"
#include "../rule/rule6102/ReduceOffDutyPeriodAwayFromBaseRule.h"
#include "../rule/rule6103/OffDutyPeriodsForCumulativeIn7DaysRule.h"
#include "../rule/rule6104/OffDutyPeriodsForCumulativeIn28DaysRule.h"
#include "../rule/rule6105/CalculateMinRestAtBaseOrLayoverStationRule.h"
#include "../rule/rule6105/CheckMinRestAtBaseOrLayoverStationRule.h"
#include "../rule/rule6107/CalculateMaxFlightDutyTimeRule.h"
#include "../rule/rule6107/CheckMaxFlightDutyTimeRule.h"
#include "../rule/rule6109/MinOffDutyPeriodForCcRule.h"
#include "../rule/rule6110/MinODPInPeriodForCcRule.h"
#include "../rule/rule6111/CheckRestDiscretionRule.h"
#include "../rule/rule6111/CalculateRestDiscretionRule.h"
#include "../rule/rule6115/CheckMaxConsecutiveDayRule.h"
#include "../rule/rule6035/CheckMaxConsecutiveNightsAwayFromBaseRule.h"
#include "../rule/rule6036/CehckWorkingDaysLimitRule.h"
#include "../rule/rule6037/LimitFlightDHDRule.h"
#include "../rule/rule6038/AdaptionPeriod4MaxFDPRule.h"
#include "../rule/rule6038/AdaptionPeriod4MaxFDPRuleParam.h"
#include "../rule/rule6039/CheckMinNumCrewRankRule.h"
#include "../rule/rule6020/CalculateDutyDpInMandayRule.h"
#include "../rule/rule6120/CheckOffDutyPeriodRule.h"
#include "../rule/rule7000/AcclimatizationOfEASARule.h"
#include "../rule/rule7006/CalculateMandayFTCustomRule.h"
#include "../rule/rule7007/CheckMinRestRule.h"
#include "../rule/rule7008/CheckConsecutiveDutyRule.h"
#include "../rule/rule7009/CheckSingleDutyPerDayRule.h"
#include "../rule/rule7011/CheckCrewCountryLimitationRule.h"
#include "../rule/rule7013/CheckCOFMultipleQualsForTGRule.h"
#include "../rule/rule6021/LimitAircraftChangeRule.h"
#include "../rule/rule7014/RecurrentExtendedRecoveryRestPeriodRule.h"
#include "../rule/rule7015/CheckRestForLateArrivalOrEarlyStartRule.h"
#include "../rule/rule7016/CheckCrewOperatingRecencyRule.h"
#include "../rule/rule7017/CalculateMaxFdpExtensionOfCcForTGRule.h"
#include "../rule/rule7018/CalculateMaxFdpOnStandbyOfCcForTGRule.h"
#include "../rule/rule7019/LimitActualFdpOnStandbyOfCcForTGRule.h"
#include "../rule/rule7021/CalculateMinRestByDutyPeriodForTGRule.h"
#include "../rule/rule7023/CalculateMinRestAtLayoverForTGRule.h"
#include "../rule/rule7024/CheckMinRestAtBaseForTGRule.h"
#include "../rule/rule7024/CalculateMinRestAtBaseForTGRule.h"
#include "../rule/rule7024/CalculateAccStartAtBaseForRTRule.h"
#include "../rule/rule7100/CalculateMinRestForEvaFdRule.h"
#include "../rule/rule7200/CalculateCheckInMinRestForEvaFdRule.h"
#include "../rule/rule7200/CheckMinRestForEvaFdRule.h"
#include "../rule/rule7202/CheckCumulativeFtLimitForEvaFdRule.h"
#include "../rule/rule7203/CheckSegmentRestrictionForEvaFdRule.h"
#include "../rule/rule7204/CheckSegmentRestrictionWOCLForEvaFdRule.h"
#include "../rule/rule7205/CheckMaxFlightTimeInPeriodForEvaFdRule.h"
#include "../rule/rule7210/CheckConsecutiveWOCLRestForEvaRule.h"
#include "../rule/rule7211/CalculateMinRestAfterCumulativeFTForEvaFdRule.h"
#include "../rule/rule7212/CheckMinWOCLAtLayoverStationForEvaFdRule.h"
#include "../rule/rule7213/CheckNightRestPeriodForEvaRule.h"
#include "../rule/rule7214/CheckLayoverRestLimitByTimeZoneForEvaFdRule.h"
#include "../rule/rule7215/CalculateCreditHoursInMandayForEvaFdRule.h"
#include "../rule/rule7217/CalculatePairingPerDiemHoursForEvaFdRule.h"
#include "../rule/rule7218/CalculatePerDiemHoursInMandayForEvaFdRule.h"
#include "../rule/rule7219/CalculateWorkingHourInMandayForEvaFdRule.h"
#include "../rule/rule7220/LimitNumberOfCrewOnFlightRule.h"
#include "../rule/rule7221/CheckImplausibleConnectionsRule.h"
#include "../rule/rule7222/CheckMaxLayoversInTripsForPairingRule.h"
#include "../rule/rule7223/CheckMaxLayoversInTripsForMonthRule.h"
#include "../rule/rule7224/CalculateFreighterCreditHoursInMandayForEvaFdRule.h"
#include "../rule/rule7225/CheckTrainingRosterForEvaFdRule.h"
#include "../rule/rule7226/CheckTrainingEndForEvaFdRule.h"
#include "../rule/rule7227/CheckLayoverRestrictionRule.h"
#include "../rule/rule7228/CalculateTrainingBriefAndDebriefForEvaFdRule.h"
#include "../rule/rule7228/CheckTrainingBriefAndDebriefForEvaFdRule.h"
#include "../rule/rule7229/CheckPassportAndVisaForEvaFdRule.h"
#include "../rule/rule7230/LimitProgramCourseRoleForEvaFdRule.h"
#include "../rule/rule7231/CheckRenewCertInAdvanceForEvaFdRule.h"
#include "../rule/rule7232/CheckConsecutiveRosterForItRule.h"
#include "../rule/rule7233/LimitCourseTimePeriodForEvaFdRule.h"
#include "../rule/rule7234/LimitCourseRoleQualForEvaFdRule.h"
#include "../rule/rule7235/LimitCourseRoleNumbersForEvaFdRule.h"
#include "../rule/rule7236/LimitDaysBetweenCoursesForEvaFdRule.h"
#include "../rule/rule7237/LimitDependBetweenCoursesForEvaFdRule.h"
#include "../rule/rule7238/LimitCourseStartTimeForEvaFdRule.h"
#include "../rule/rule7239/LimitCourseDeviceTypeForEvaFdRule.h"
#include "../rule/rule7240/CheckCourseDeviceAvailForEvaFdRule.h"
#include "../rule/rule7241/LimitCoursePipNumbersForEvaFdRule.h"
#include "../rule/rule7242/LimitCourseDurationForEvaFdRule.h"
#include "../rule/rule7243/LimitSameRoleInstructorForEvaFdRule.h"
#include "../rule/rule7244/LimitProgramCourseOnFlightForEvaFdRule.h"
#include "../rule/rule7245/LimitTrainingRoleInTeamForEvaFdRule.h"
#include "../rule/rule7246/LimitSameDeviceInProgramForEvaFdRule.h"
#include "../rule/rule7247/RestrictInstructorHoldRoleForEvaFdRule.h"
#include "../rule/rule7248/RestrictTraineeHoldAssignmentForEvaFdRule.h"
#include "../rule/rule7249/RequiredMinNumOfCourseForEvaFdRule.h"
#include "../rule/rule7250/CheckUnassignedCourseForEvaFdRule.h"
#include "../rule/rule7251/LimitCourseRoleQualAndNumbersForEvaFdRule.h"
#include "../rule/rule7252/CheckFailedCourseForEvaFdRule.h"
#include "../rule/rule7253/LimitLegAndStationForEvaFdRule.h"
#include "../rule/rule7254/BuddiesInSameCourseForEvaFdRule.h"
#include "../rule/rule7255/LimitSameCourseCodeInDutyForEvaFdRule.h"
#include "../rule/rule7256/LimitMaxGapDaysBetweenCoursesForEvaFdRule.h"
#include "../rule/rule7257/LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule.h"
#include "../rule/rule7258/LimitSameRoleInstructorOnExtraCourseForEvaFdRule.h"
#include "../rule/rule7259/CheckCourseOnlyAssignInstructorForEvaFdRule.h"
#include "../rule/rule7260/CalculatePICForEvaRule.h"
#include "../rule/rule7261/CheckAcclimatizedRestRuleForEva.h"
#include "../rule/rule7262/LimitInexpCrewForEvaFdRule.h"
#include "../rule/rule7263/CheckMaxEarlyStartOrLateFinishWithinPeriodRule.h"
#include "../rule/rule7264/CheckSchTimeAbnlForEvaFdRule.h"
#include "../rule/rule7265/CheckSchMinRestForEvaFdRule.h"
#include "../rule/rule7266/CheckSchMinRestAfterCumulativeFTForEvaFdRule.h"
#include "../rule/rule7267/CheckSchMinWOCLAtLayoverStationForEvaFdRule.h"
#include "../rule/rule7268/CheckSchConsecutiveWOCLRestForEvaRule.h"
#include "../rule/rule7271/CheckSchAcclimatizedRestRuleForEva.h"
#include "../rule/rule7272/CalculateStandbyDPForTGRule.h"
#include "../rule/rule7273/CheckMinConnectInDutyRule.h"
#include "../rule/rule7274/CheckIOEPhaseFlightCompositionRule.h"
#include "../rule/rule7279/LimitULROnTrainingForEvaFdRule.h"
#include "../rule/rule7300/CalculateMaxDutyTimeForPRRule.h"
#include "../rule/rule7302/CalculateMaxFDPByCalloutStandbyForPRRule.h"
#include "../rule/rule7303/CalculateMaxDPPerAvgBLHOfCBAForPRRule.h"
#include "../rule/rule7305/LimitMaxConsecutiveDutyTimesForPRRule.h"
#include "../rule/rule7306/LimitMinRestLFESFlightForPRRule.h"
#include "../rule/rule7307/CalculateMinRestBasedLocalNightForPRRule.h"
#include "../rule/rule7307/CheckMinRestBasedLocalNightForPRRule.h"
#include "../rule/rule7308/CheckEarnedDaysOffForPRRule.h"
#include "../rule/rule7309/LimitMinRestBetweenRostersForPRRule.h"
#include "../rule/rule7310/CalculateDutyAloftInMandayForPRRule.h"
#include "../rule/rule7315/RestictCrewOrFlightForPRRule.h"
#include "../rule/rule7320/CrewOnlyPerformSpecificTaskForPRRule.h"
#include "../rule/rule7321/TaskOnlyBeOperatedByFilteredCrewForPRRule.h"
#include "../rule/rule7322/CrewCannotOperateSpecificTaskForPRRule.h"
#include "../rule/rule7324/CheckBirthdayDaysOffForPRRule.h"
#include "../rule/rule7326/CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule.h"
#include "../rule/rule7327/CheckMinRestAfterBaseChangeForPRRule.h"
#include "../rule/rule7328/CalculateCreditHoursInMandayForPRRule.h"
#include "../rule/rule7356/LimitAttributesSpacingBasedMandayForPRRule.h"
#include "../rule/rule7357/LimitMaxAttributesNumberBasedMandayForPRRule.h"
#include "../rule/rule6011/CheckMinRestBetweenConsecutiveDaysRule.h"
#include "../rule/rule7022/CalculateReducedRestForTGRule.h"
#include "../rule/rule7022/CheckReducedRestForTGRule.h"
#include "../rule/rule7275/CheckDaysOffForTradeRule.h"
#include "../rule/rule7115/CheckMaxConsecutiveDutyRuleForIt.h"
#include "../rule/rule7311/CalculateMinRestByBlockTimeForPRRule.h"
#include "../rule/rule7311/LimitMinRestByBlockTimeForPRRule.h"
#include "../rule/rule7312/CheckMaxFlightsInPeriodForPRRule.h"
#include "../rule/rule7276/CheckDisruptiveSchedulesLocalNightForTGRule.h"
#include "../rule/rule7277/CheckDisruptiveScheduleRERRPForTGRule.h"
#include "../rule/rule7313/CalculateMaxDPByComplementForPRRule.h"
#include "../rule/rule6041/CheckMaxNumberOfDPInRPForQQRule.h"
#include "../rule/rule7314/CheckGenderOnFlightByCompositionForPRRule.h"
#include "../rule/rule7278/CalculateCourseFDPForTGRule.h"
#include "../rule/rule7028/CalculateSplitDutyMaxFdpExtensionForTGRule.h"
#include "../rule/rule7029/CalculateFdpExtensionWithInFlightRestOfCcForTGRule.h"
#include "../rule/rule7323/CheckMinSpaceBetweenDutyForRPRule.h"
#include "../rule/rule7325/CheckMinNumberOfDaysOffForPRRule.h"
#include "../rule/rule7360/CheckAircraftChangeAlertForPRRule.h"
#include "../rule/rule7362/LimitAreaEntryCountForPRRule.h"
// SQ rules
#include "../rule/rule7400/AcclimatizationOfANRRule.h"
#include "../rule/rule7405/UlrDutyDefinition.h"
#include "../rule/rule7412/CalculateMinimumRestPeriodForSQRule.h"
#include "../rule/rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "../rule/rule7410/CheckAnrMaxFdpRule.h"
#include "../rule/rule7410/CalculateAnrMaxFdpRule.h"
#include "../rule/rule7414/CheckAnrConsecutiveSpecialDutyRule.h"
#include "../rule/rule7415/CheckAnrDayOffSpacingRule.h"
#include "../rule/rule7416/CheckAnrMinDayOffInPeriodRule.h"
#include "../rule/rule7417/CheckAnrReportingDebriefRule.h"
#include "../rule/rule7420/AcopFdpPatternRule.h"
#include "../rule/rule7421/AcopSlipPatternRule.h"
#include "../rule/rule7422/CalculateAtdoAfterSlipForSQRule.h"
#include "../rule/rule7423/CalculatePostUlrRestAtBaseForSQRule.h"
#include "../rule/rule7424/CalculateOvernightAtdoAtBaseForSQRule.h"
#include "../rule/rule7434/MaxDutyPeriodRuleForSQ.h"
#include "../rule/rule7435/MinPairingDaysForUlrStandbyRule.h"
#include "../rule/rule7450/FdpSectorLimitForSQRule.h"
#include "../rule/rule7451/RestrictCoterminalDutyConnectionForSQRule.h"
#include "../rule/rule7452/UlrFdpClassificationMismatchForSQRule.h"
#include "../rule/rule7453/RequireSameCityAroundUlrDutyForSQRule.h"
#include "../rule/rule7460/RestrictMidDutyBaseTurnRule.h"
#include "../rule/rule7461/RestrictDhdAndPositionOnFreightForSQRule.h"
#include "../rule/rule7462/CheckAllowedMultiSectorDutyForFreighterForSQRule.h"
#include "../rule/rule7463/LimitSwingbackForSQRule.h"
#include "../rule/rule7464/LimitTransportLengthForSQRule.h"
#include "../rule/rule7465/CalculateMinScheDaysOffAtBaseForSQRule.h"
#include "../rule/rule7466/CalculateExtraDaysOffAtBaseForSQRule.h"
#include "../rule/rule7467/LimitRestTimeBetweenFlightsForSQRule.h"
#include "../rule/rule7468/LimitPositioningInCopForSQRule.h"
#include "../rule/rule7469/ForcedComplementForDutyRouteForSQRule.h"
//HX rules
#include "../rule/rule7480/LimitDutyDaysOffForHXRule.h"
#include "../rule/rule7481/CalculateRedEyeDutyForHXRule.h"
#include "../rule/rule7482/AcclimatizationForHXRule.h"
#include "../rule/rule7482/LimitTaskOnRecoveryPeriodForHXRule.h"
#include "../rule/rule7486/LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule.h"
#include "../rule/rule7487/CheckMaxDurationFromStandbyToFlightDutyEndForHXRule.h"
#include "../rule/rule7484/CalculateMaxFlightDutyPeriodForHXRule.h"
#include "../rule/rule7485/CheckCompositionRequirementForHXRule.h"
#include "../rule/rule7488/CalculateMinRestForHXRule.h"
#include "../rule/rule7489/LimitConsecutiveDayMinRestForHXRule.h"
#include "../rule/rule7490/CalculateFdpExtensionForHXRule.h"
#include "../rule/rule7491/CalculateFdpExtensionForCcForHXRule.h"
#include "../rule/rule7492/CalculateMaxFdpExtensionForSplitDutyForHXRule.h"
#include "../rule/rule7493/LimitConsecutiveDutyDaysOffForHXRule.h"
#include "../rule/rule7494/LimitFleetSectorByQaulificationForHXRule.h"
#include "../rule/rule7495/LimitConsecutiveTaskBeforeAfterDayOffForHXRule.h"
#include "../rule/rule7496/LimitMinWorkDaysBetweenAssignmentsForHXRule.h"

#include "../rule/rule7317/CalculateFdpAndExtensionFor5JRule.h"
#include "../rule/rule6121/CheckAssignmentOverlappableRule.h"

#include "../rule/rule7372/CalculateGroundDPForTGRule.h"
#include "../rule/rule7373/CalculateGroundRosterMinRestFor5JRule.h"
#include "../rule/rule7374/CalculateMaxFDPByCalloutFor5JRule.h"
#include "../rule/rule7387/CheckStandbyCalloutDurationFor5JRule.h"
#include "../rule/rule7388/LimitCourseWeekdayFor5JRule.h"
#include "../rule/rule7389/LimitTrainingConsecutiveDaysFor5JRule.h"
#include "../rule/rule7358/CheckMaxFatigueScoreFor5JRule.h"
#include "../rule/rule7359/CheckStandardFdpExtensionRestRequirementRule.h"
#include "../rule/rule7361/CheckDaysOffFor5JRule.h"
#include "../rule/rule7363/CalculateInexperiencedCrewFor5JRule.h"
#include "../rule/rule7364/CheckInexperiencedCrewFor5JRule.h"
#include "../rule/rule7365/CheckLegalDaysOffFor5JRule.h"
#include "../rule/rule7366/CheckConsecutiveDaysOffRequirementFor5JRule.h"

//Flair(F8)
#include "../rule/rule7500/AcclimatizationForCARSRule.h"
#include "../rule/rule7501/LimitSingleDayFreeFromDutyForCARSRule.h"
#include "../rule/rule7502/CalculateCreditHoursForCARSRule.h"
#include "../rule/rule7503/LimitConsecutiveWoclForCARSRule.h"
#include "../rule/rule7504/CheckMinSpaceBetweenDutyForF8Rule.h"
#include "../rule/rule7505/MinimumDaysOffForCARSRule.h"
#include "../rule/rule7506/SingleDailyCheckinForCARSRule.h"

namespace RuleAlias {
	using CHECKRULE0000 = CheckGeneralRule;
	using CALCRULE2001 = CalculateManualLimitRule;
	using CHECKRULE3003 = LimitDepOrArrStationForPairingRule;
	using CALCRULE6005 = AcclimatizationRule;
	using CALCRULE6006 = CalculateAirportRestFaciltyRule;
	using CHECKRULE7410 = CheckAnrMaxFdpRule;
	using CALCRULE7410 = CalculateAnrMaxFdpRule;
	using CHECKRULE7414 = CheckAnrConsecutiveSpecialDutyRule;
	using CHECKRULE7415 = CheckAnrDayOffSpacingRule;
	using CHECKRULE7416 = CheckAnrMinDayOffInPeriodRule;
	using CHECKRULE7417 = CheckAnrReportingDebriefRule;
	using CHECKRULE7420 = AcopFdpPatternRule;
	using CHECKRULE7421 = AcopSlipPatternRule;
	using CALCRULE7422 = CalculateAtdoAfterSlipForSQRule;
	using CALCRULE7423 = CalculatePostUlrRestAtBaseForSQRule;
	using CALCRULE7424 = CalculateOvernightAtdoAtBaseForSQRule;
	using CHECKRULE7434 = MaxDutyPeriodRuleForSQ;
	using CHECKRULE7435 = MinPairingDaysForUlrStandbyRule;
	using CHECKRULE7450 = FdpSectorLimitForSQRule;	
	using CHECKRULE7451 = RestrictCoterminalDutyConnectionForSQRule;
	using CHECKRULE7452 = UlrFdpClassificationMismatchForSQRule;
	using CHECKRULE7453 = RequireSameCityAroundUlrDutyForSQRule;
	using CHECKRULE6007 = CheckMaxFlightDutyPeriodRule;
	using CALCRULE6007 = CalculateMaxFlightDutyPeriodRule;
	using CHECKRULE6008 = CheckFdpAndFtDiscretionForFdRule;
	using CALCRULE6008 = CalculateFdpAndFtDiscretionForFdRule;
	using CHECKRULE6009 = CheckFdpAndFtDiscretionForCCRule;
	using CALCRULE6009 = CalculateFdpAndFtDiscretionForCCRule;
	using CHECKRULE6010 = LimitBeforeAnnualLeaveRule;
	using CHECKRULE6011 = CheckMinRestBetweenConsecutiveDaysRule;
	using CHECKRULE6018 = LimitLongTransitRule;
	using CHECKRULE6019 = LimitTransitAndLayoverRule;
	using CALCRULE6020 = CalculateMaxFlightDutyBySplitDutyRule;
	using CHECKRULE6020 = CheckMaxFlightDutyBySplitDutyRule;
	using CHECKRULE6021 = LimitAircraftChangeRule;
    using CALCRULE6022 = CalculateDutyTimeForDelayedFlightRule;
	using CALCRULE6024 = CalculateMaxFdpForStandbyRule;
	using CALCRULE6025 = CalculateMaxDutyPeriodRule;
	using CHECKRULE6025 = CheckMaxDutyPeriodRule;
	using CHECKRULE6026 = LimitFleetForStandbyRule;
	using CALCINTRULE6020 = CalculateDutyDpInMandayRule;
	using CHECKRULE6032 = CheckMaxConsecutiveWOCLDutyRule;
	using CHECKRULE6033 = CheckMaxConsecutiveEarlyStartRule;
	using CHECKRULE6034 = CheckMaxEarlyDutyInAnyConsecutiveDayRule;
	using CHECKRULE6035 = CheckMaxConsecutiveNightsAwayFromBaseRule;
	using CHECKRULE6036 = CehckWorkingDaysLimitRule;
	using CHECKRULE6037 = LimitFlightDHDRule;
	using CHECKRULE6038 = AdaptionPeriod4MaxFDPRule; // Added by Aspen on 2024.08.06 for rule 6038
	using CHECKRULE6039 = CheckMinNumCrewRankRule;
	using CHECKRULE6041 = CheckMaxNumberOfDPInRPForQQRule;
	using CALCRULE6100 = CalculationOfOffDutyPeriodRule;
	using CALCRULE6101 = ReduceOffDutyPeriodAtBaseRule;
	using CALCRULE6102 = ReduceOffDutyPeriodAwayFromBaseRule;
	using CHECKRULE6103 = OffDutyPeriodsForCumulativeIn7DaysRule;
	using CHECKRULE6104 = OffDutyPeriodsForCumulativeIn28DaysRule;
	using CALCRULE6105 = CalculateMinRestAtBaseOrLayoverStationRule;
	using CHECKRULE6105 = CheckMinRestAtBaseOrLayoverStationRule;
	using CHECKRULE6107 = CheckMaxFlightDutyTimeRule;
	using CALCRULE6107 = CalculateMaxFlightDutyTimeRule;
	using CALCRULE6109 = MinOffDutyPeriodForCcRule;
	using CHECKRULE6110 = MinODPInPeriodForCcRule;
	using CHECKRULE6111 = CheckRestDiscretionRule;
	using CALCRULE6111 = CalculateRestDiscretionRule;
	using CHECKRULE6115 = CheckMaxConsecutiveDayRule;
	using CHECKRULE6120 = CheckOffDutyPeriodRule;
	using CALCRULE7000 = AcclimatizationOfEASARule;
	using CALCRULE7100 = CalculateMinRestForEvaFdRule;
	using CHECKRULE7115 = CheckMaxConsecutiveDutyRuleForIt;
	using CALCRULE7200 = CalculateCheckInMinRestForEvaFdRule;
	using CHECKRULE7200 = CheckMinRestForEvaFdRule;
	using CHECKRULE7202 = CheckCumulativeFtLimitForEvaFdRule;
	using CHECKRULE7203 = CheckSegmentRestrictionForEvaFdRule;
	using CHECKRULE7204 = CheckSegmentRestrictionWOCLForEvaFdRule;
	using CHECKRULE7205 = CheckMaxFlightTimeInPeriodForEvaFdRule;
	using CALCRULE7211 = CalculateMinRestAfterCumulativeFTForEvaFdRule;
    using CHECKRULE7212 = CheckMinWOCLAtLayoverStationForEvaFdRule;
	using CHECKRULE7214 = CheckLayoverRestLimitByTimeZoneForEvaFdRule;
	using CALCRULE7006 = CalculateMandayFTCustomRule;
	using CHECKRULE7007 = CheckMinRestRule;
	using CHECKRULE7008 = CheckConsecutiveDutyRule;
	using CHECKRULE7009 = CheckSingleDutyPerDayRule;
	using CHECKRULE7011 = CheckCrewCountryLimitationRule;
	using CHECKRULE7013 = CheckCOFMultipleQualsForTGRule;
	using CHECKRULE7014 = RecurrentExtendedRecoveryRestPeriodRule;
	using CHECKRULE7015 = CheckRestForLateArrivalOrEarlyStartRule;
	using CHECKRULE7016 = CheckCrewOperatingRecencyRule;
	using CALCRULE7017 = CalculateMaxFdpExtensionOfCcForTGRule;
	using CALCRULE7018 = CalculateMaxFdpOnStandbyOfCcForTGRule;
	using CHECKRULE7019 = LimitActualFdpOnStandbyOfCcForTGRule;
	using CALCRULE7021 = CalculateMinRestByDutyPeriodForTGRule;
	using CALCRULE7022 = CalculateReducedRestForTGRule;
	using CHECKRULE7022 = CheckReducedRestForTGRule;
	using CALCRULE7023 = CalculateMinRestAtLayoverForTGRule;
	using CHECKRULE7024 = CheckMinRestAtBaseForTGRule;
	using CALCRULE7024 = CalculateMinRestAtBaseForTGRule;
	using CALCRULE7024_ACC = CalculateAccStartAtBaseForRTRule;
	using CALCRULE7028 = CalculateSplitDutyMaxFdpExtensionForTGRule;
	using CALCRULE7029 = CalculateFdpExtensionWithInFlightRestOfCcForTGRule;
	using CHECKRULE7210 = CheckConsecutiveWOCLRestForEvaRule;
	using CHECKRULE7213 = CheckNightRestPeriodForEvaRule;
	using CALCRULE7215 = CalculateCreditHoursInMandayForEvaFdRule;
	using CALCRULE7217 = CalculatePairingPerDiemHoursForEvaFdRule;
	using CALCRULE7218 = CalculatePerDiemHoursInMandayForEvaFdRule;
	using CALCRULE7219 = CalculateWorkingHourInMandayForEvaFdRule;
	using CHECKRULE7220 = LimitNumberOfCrewOnFlightRule;
	using CHECKRULE7221 = CheckImplausibleConnectionsRule;
	using CHECKRULE7222 = CheckMaxLayoversInTripsForPairingRule;
	using CHECKRULE7223 = CheckMaxLayoversInTripsForMonthRule;
	using CALCRULE7224 = CalculateFreighterCreditHoursInMandayForEvaFdRule;
	using CHECKRULE7225 = CheckTrainingRosterForEvaFdRule;
	using CHECKRULE7226 = CheckTrainingEndForEvaFdRule;
	using CHECKRULE7227 = CheckLayoverRestrictionRule;
	using CALCRULE7228 = CalculateTrainingBriefAndDebriefForEvaFdRule;
	using CHECKRULE7228 = CheckTrainingBriefAndDebriefForEvaFdRule;
	using CHECKRULE7229 = CheckPassportAndVisaForEvaFdRule;
	using CHECKRULE7230 = LimitProgramCourseRoleForEvaFdRule;
	using CHECKRULE7231 = CheckRenewCertInAdvanceForEvaFdRule;
	using CHECKRULE7232 = CheckConsecutiveRosterForItRule;
	using CHECKRULE7233 = LimitCourseTimePeriodForEvaFdRule;
	using CHECKRULE7234 = LimitCourseRoleQualForEvaFdRule;
	using CHECKRULE7235 = LimitCourseRoleNumbersForEvaFdRule;
	using CHECKRULE7236 = LimitDaysBetweenCoursesForEvaFdRule;
	using CHECKRULE7237 = LimitDependBetweenCoursesForEvaFdRule;
	using CHECKRULE7238 = LimitCourseStartTimeForEvaFdRule;
	using CHECKRULE7239 = LimitCourseDeviceTypeForEvaFdRule;
	using CHECKRULE7240 = CheckCourseDeviceAvailForEvaFdRule;
	using CHECKRULE7241 = LimitCoursePipNumbersForEvaFdRule;
	using CHECKRULE7242 = LimitCourseDurationForEvaFdRule;
	using CHECKRULE7243 = LimitSameRoleInstructorForEvaFdRule;
	using CHECKRULE7244 = LimitProgramCourseOnFlightForEvaFdRule;
	using CHECKRULE7245 = LimitTrainingRoleInTeamForEvaFdRule;
	using CHECKRULE7246 = LimitSameDeviceInProgramForEvaFdRule;
	using CHECKRULE7247 = RestrictInstructorHoldRoleForEvaFdRule;
	using CHECKRULE7248 = RestrictTraineeHoldAssignmentForEvaFdRule;
	using CHECKRULE7249 = RequiredMinNumOfCourseForEvaFdRule;
	using CHECKRULE7250 = CheckUnassignedCourseForEvaFdRule;
	using CHECKRULE7251 = LimitCourseRoleQualAndNumbersForEvaFdRule;
	using CHECKRULE7252 = CheckFailedCourseForEvaFdRule;
	using CHECKRULE7253 = LimitLegAndStationForEvaFdRule;
	using CHECKRULE7254 = BuddiesInSameCourseForEvaFdRule;
	using CHECKRULE7255 = LimitSameCourseCodeInDutyForEvaFdRule;
	using CHECKRULE7256 = LimitMaxGapDaysBetweenCoursesForEvaFdRule;
	using CHECKRULE7257 = LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule;
	using CHECKRULE7258 = LimitSameRoleInstructorOnExtraCourseForEvaFdRule;
	using CHECKRULE7259 = CheckCourseOnlyAssignInstructorForEvaFdRule;
	using CALCRULE7260 = CalculatePICForEvaRule;
	using CHECKRULE7261 = CheckAcclimatizedRestRuleForEva;
	using CHECKRULE7262 = LimitInexpCrewForEvaFdRule;
	using CHECKRULE7263 = CheckMaxEarlyStartOrLateFinishWithinPeriodRule;
	using CHECKRULE7264 = CheckSchTimeAbnlForEvaFdRule;
	using CHECKRULE7265 = CheckSchMinRestForEvaFdRule;
	using CHECKRULE7266 = CheckSchMinRestAfterCumulativeFTForEvaFdRule;
	using CHECKRULE7267 = CheckSchMinWOCLAtLayoverStationForEvaFdRule;
	using CHECKRULE7268 = CheckSchConsecutiveWOCLRestForEvaRule;
	using CHECKRULE7271 = CheckSchAcclimatizedRestRuleForEva;
	using CALCRULE7272 = CalculateStandbyDPForTGRule;
	using CHECKRULE7273 = CheckMinConnectInDutyRule;
	using CHECKRULE7274 = CheckIOEPhaseFlightCompositionRule;
	using CHECKRULE7275 = CheckDaysOffForTradeRule;
	using CHECKRULE7276 = CheckDisruptiveSchedulesLocalNightForTGRule;
	using CHECKRULE7277 = CheckDisruptiveScheduleRERRPForTGRule;
	using CALCRULE7278 = CalculateCourseFDPForTGRule;
	using CHECKRULE7279 = LimitULROnTrainingForEvaFdRule;
	using CALCRULE7300 = CalculateMaxDutyTimeForPRRule;
	using CALCRULE7302 = CalculateMaxFDPByCalloutStandbyForPRRule;
	using CALCRULE7303 = CalculateMaxDPPerAvgBLHOfCBAForPRRule;
	using CHECKRULE7305 = LimitMaxConsecutiveDutyTimesForPRRule;
	using CHECKRULE7306 = LimitMinRestLFESFlightForPRRule;
	using CALCRULE7307 = CalculateMinRestBasedLocalNightForPRRule;
	using CHECKRULE7307 = CheckMinRestBasedLocalNightForPRRule;
	using CHECKRULE7308 = CheckEarnedDaysOffForPRRule;
	using CHECKRULE7309 = LimitMinRestBetweenRostersForPRRule;
	using CALCRULE7310 = CalculateDutyAloftInMandayForPRRule;
	using CALCRULE7311 = CalculateMinRestByBlockTimeForPRRule;
	using CHECKRULE7311 = LimitMinRestByBlockTimeForPRRule;
	using CHECKRULE7312 = CheckMaxFlightsInPeriodForPRRule;
	using CALCRULE7313 = CalculateMaxDPByComplementForPRRule;
	using CHECKRULE7314 = CheckGenderOnFlightByCompositionForPRRule;
	using CHECKRULE7315 = RestictCrewOrFlightForPRRule;
	using CHECKRULE7320 = CrewOnlyPerformSpecificTaskForPRRule;
	using CHECKRULE7321 = TaskOnlyBeOperatedByFilteredCrewForPRRule;
	using CHECKRULE7322 = CrewCannotOperateSpecificTaskForPRRule;
    using CHECKRULE7323 = CheckMinSpaceBetweenDutyForRPRule;
    using CALCRULE7400 = AcclimatizationOfANRRule;
    using CALCRULE7405 = ULRDutyDefinition;
	using CHECKRULE7324 = CheckBirthdayDaysOffForPRRule;
	using CHECKRULE7325 = CheckMinNumberOfDaysOffForPRRule;
	using CHECKRULE7326 = CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule;
	using CHECKRULE7327 = CheckMinRestAfterBaseChangeForPRRule;
	using CALCRULE7328 = CalculateCreditHoursInMandayForPRRule;
	using CHECKRULE7356 = LimitAttributesSpacingBasedMandayForPRRule;
	using CHECKRULE7357 = LimitMaxAttributesNumberBasedMandayForPRRule;
	using CHECKRULE7360 = CheckAircraftChangeAlertForPRRule;
	using CHECKRULE7361 = CheckDaysOffFor5JRule;
	using CHECKRULE7362 = LimitAreaEntryCountForPRRule;
	using CALCRULE7363 = CalculateInexperiencedCrewFor5JRule;
	using CHECKRULE7364 = CheckInexperiencedCrewFor5JRule;
	using CHECKRULE7365 = CheckLegalDaysOffFor5JRule;
	using CHECKRULE7366 = CheckConsecutiveDaysOffRequirementFor5JRule;
	using CHECKRULE7460 = RestrictMidDutyBaseTurnRule;
	using CALCRULE7317 = CalculateFdpAndExtensionFor5JRule;
    using CALCRULE7412 = CalculateMinimumRestPeriodForSQRule;
    using CHECKRULE7412 =CheckMinimumRestPeriodForSQRule;
	using CHECKRULE7461 = RestrictDhdAndPositionOnFreightForSQRule;
	using CHECKRULE7462 = CheckAllowedMultiSectorDutyForFreighterForSQRule;
	using CHECKRULE7463 = LimitSwingbackForSQRule;
	using CHECKRULE7464 = LimitTransportLengthForSQRule;
	using CALCRULE7465 = CalculateMinScheDaysOffAtBaseForSQRule;
	using CALCRULE7466 = CalculateExtraDaysOffAtBaseForSQRule;
	using CHECKRULE7467 = LimitRestTimeBetweenFlightsForSQRule;
	using CHECKRULE7468 = LimitPositioningInCopForSQRule;
	using CHECKRULE7469 = ForcedComplementForDutyRouteForSQRule;
	using CHECKRULE7480 = LimitDutyDaysOffForHXRule;
	using CALCRULE7481 = CalculateRedEyeDutyForHXRule;
	using CALCRULE7482 = AcclimatizationForHXRule;
	using CHECKRULE7482 = LimitTaskOnRecoveryPeriodForHXRule;
	using CALCRULE7484 = CalculateMaxFlightDutyPeriodForHXRule;
	using CHECKRULE7485 = CheckCompositionRequirementForHXRule;
	using CHECKRULE7486 = LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule;
	using CHECKRULE7487 = CheckMaxDurationFromStandbyToFlightDutyEndForHXRule;
	using CALCRULE7488 = CalculateMinRestForHXRule;
	using CHECKRULE7489 = LimitConsecutiveDayMinRestForHXRule;
	using CALCRULE7490 = CalculateFdpExtensionForHXRule;
	using CALCRULE7491 = CalculateFdpExtensionForCcForHXRule;
	using CALCRULE7492 = CalculateMaxFdpExtensionForSplitDutyForHXRule;
	using CHECKRULE7493 = LimitConsecutiveDutyDaysOffForHXRule;
	using CHECKRULE7494 = LimitFleetSectorByQaulificationForHXRule;
	using CHECKRULE7495 = LimitConsecutiveTaskBeforeAfterDayOffForHXRule;
	using CHECKRULE7496 = LimitMinWorkDaysBetweenAssignmentsForHXRule;
	using CHECKRULE6121 = CheckAssignmentOverlappableRule;
	using CALCRULE7372 = CalculateGroundDPForTGRule;
	using CALCRULE7373 = CalculateGroundRosterMinRestFor5JRule;
	using CALCRULE7374 = CalculateMaxFDPByCalloutFor5JRule;
	using CHECKRULE7387 = CheckStandbyCalloutDurationFor5JRule;
	using CHECKRULE7388 = LimitCourseWeekdayFor5JRule;
	using CHECKRULE7389 = LimitTrainingConsecutiveDaysFor5JRule;
	using CHECKRULE7358 = CheckMaxFatigueScoreFor5JRule;
	using CHECKRULE7359 = CheckStandardFdpExtensionRestRequirementRule;

	using CALCRULE7500 = AcclimatizationForCARSRule;
	using CHECKRULE7501 = LimitSingleDayFreeFromDutyForCARSRule;
	using CALCRULE7502 = CalculateCreditHoursForCARSRule;	
	using CHECKRULE7503 = LimitConsecutiveWoclForCARSRule;
	using CHECKRULE7504 = CheckMinSpaceBetweenDutyForF8Rule;
	using CHECKRULE7505 = MinimumDaysOffForCARSRule;
	using CHECKRULE7506 = SingleDailyCheckinForCARSRule;
}
