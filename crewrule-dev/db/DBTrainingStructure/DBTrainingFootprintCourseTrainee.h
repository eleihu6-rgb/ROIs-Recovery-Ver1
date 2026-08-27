#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSETRAINEE_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSETRAINEE_H

#include <string>
#include <vector>

class DBTrainingFootprintCourseTrainee {
public:
    DBTrainingFootprintCourseTrainee(long long id, long long footprintId, long long footprintCourseId,
                                     long long durationSeconds, std::string startTimeOption,
                                     std::vector<int> startTimeMinutes, std::string timePeriodOption,
                                     std::vector<int> timePeriodStartMinutes,
                                     std::vector<int> timePeriodEndMinutes)
        : _id(id), _footprintId(footprintId), _footprintCourseId(footprintCourseId),
          _durationSeconds(durationSeconds), _startTimeOption(std::move(startTimeOption)),
          _startTimeMinutes(std::move(startTimeMinutes)), _timePeriodOption(std::move(timePeriodOption)),
          _timePeriodStartMinutes(std::move(timePeriodStartMinutes)),
          _timePeriodEndMinutes(std::move(timePeriodEndMinutes)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetFootprintId() const { return _footprintId; }
    [[nodiscard]] long long GetFootprintCourseId() const { return _footprintCourseId; }
    [[nodiscard]] long long GetDurationSeconds() const { return _durationSeconds; }
    [[nodiscard]] const std::string &GetStartTimeOption() const { return _startTimeOption; }
    [[nodiscard]] const std::vector<int> &GetStartTimeMinutes() const { return _startTimeMinutes; }
    [[nodiscard]] const std::string &GetTimePeriodOption() const { return _timePeriodOption; }
    [[nodiscard]] const std::vector<int> &GetTimePeriodStartMinutes() const { return _timePeriodStartMinutes; }
    [[nodiscard]] const std::vector<int> &GetTimePeriodEndMinutes() const { return _timePeriodEndMinutes; }

private:
    long long _id;
    long long _footprintId;
    long long _footprintCourseId;
    long long _durationSeconds;
    std::string _startTimeOption;
    std::vector<int> _startTimeMinutes;
    std::string _timePeriodOption;
    std::vector<int> _timePeriodStartMinutes;
    std::vector<int> _timePeriodEndMinutes;
};

#endif
