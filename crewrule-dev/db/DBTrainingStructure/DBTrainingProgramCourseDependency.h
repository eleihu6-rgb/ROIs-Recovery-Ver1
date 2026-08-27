//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEDEPENDENCY_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEDEPENDENCY_H


class DBTrainingProgramCourseDependency {
public:
    DBTrainingProgramCourseDependency(long long previousProgramCourseId, long long nextProgramCourseId)
            : _previousProgramCourseId(previousProgramCourseId), _nextProgramCourseId(nextProgramCourseId) {}

    const long long GetPreviousProgramCourseId() const { return _previousProgramCourseId; }

    void SetPreviousProgramCourseId(long long previousProgramCourseId) { _previousProgramCourseId = previousProgramCourseId; }

    const long long GetNextProgramCourseId() const { return _nextProgramCourseId; }

    void SetNextProgramCourseId(long long nextProgramCourseId) { _nextProgramCourseId = nextProgramCourseId; }

private:
    long long _previousProgramCourseId;
    long long _nextProgramCourseId;         //“Next course” must be strictly behind “previous Program course” (unless pre-assigned)
};


#endif //TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEDEPENDENCY_H
